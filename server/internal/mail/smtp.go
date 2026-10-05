package mail

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"mime"
	"net"
	"net/smtp"
	"strconv"
	"strings"
	"time"
)

// Config 来自管理端保存的发信设置。
type Config struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
	FromName string
}

// Message 是一封纯文本邮件。
type Message struct {
	To      string
	Subject string
	Body    string
}

// Sender 发送邮件。测试可以替换实现。
type Sender interface {
	Send(ctx context.Context, cfg Config, msg Message) error
}

// SMTPSender 使用标准库发信。465 走 TLS，其他端口走 STARTTLS。
type SMTPSender struct{}

func (SMTPSender) Send(ctx context.Context, cfg Config, msg Message) error {
	if cfg.Host == "" || cfg.Port <= 0 || cfg.From == "" || msg.To == "" {
		return errors.New("邮件服务未配置")
	}
	addr := net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port))
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	var (
		conn net.Conn
		err  error
	)
	if cfg.Port == 465 {
		conn, err = (&tls.Dialer{
			NetDialer: dialer,
			Config:    &tls.Config{ServerName: cfg.Host, MinVersion: tls.VersionTLS12},
		}).DialContext(ctx, "tcp", addr)
	} else {
		conn, err = dialer.DialContext(ctx, "tcp", addr)
	}
	if err != nil {
		return err
	}
	client, err := smtp.NewClient(conn, cfg.Host)
	if err != nil {
		_ = conn.Close()
		return err
	}
	defer client.Close()
	if cfg.Port != 465 {
		if err := client.StartTLS(&tls.Config{ServerName: cfg.Host, MinVersion: tls.VersionTLS12}); err != nil {
			return err
		}
	}
	if cfg.Username != "" {
		if err := client.Auth(smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)); err != nil {
			return err
		}
	}
	if err := client.Mail(cfg.From); err != nil {
		return err
	}
	if err := client.Rcpt(msg.To); err != nil {
		return err
	}
	writer, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := writer.Write([]byte(render(cfg, msg))); err != nil {
		_ = writer.Close()
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	return client.Quit()
}

func render(cfg Config, msg Message) string {
	from := cfg.From
	if cfg.FromName != "" {
		from = mime.QEncoding.Encode("utf-8", cfg.FromName) + " <" + cfg.From + ">"
	}
	body := strings.ReplaceAll(msg.Body, "\r\n", "\n")
	body = strings.ReplaceAll(body, "\n", "\r\n")
	return fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
		from, msg.To, mime.QEncoding.Encode("utf-8", msg.Subject), body)
}
