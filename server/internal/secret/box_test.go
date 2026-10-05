package secret

import "testing"

func TestEncryptRoundTrip(t *testing.T) {
	encoded, err := Encrypt("test-key", "rainforest-secret")
	if err != nil {
		t.Fatal(err)
	}
	if encoded == "rainforest-secret" {
		t.Fatal("secret was stored in plaintext")
	}
	got, err := Decrypt("test-key", encoded)
	if err != nil {
		t.Fatal(err)
	}
	if got != "rainforest-secret" {
		t.Fatalf("got %q", got)
	}
	if _, err := Decrypt("other-key", encoded); err == nil {
		t.Fatal("wrong key decrypted the secret")
	}
	if _, err := Encrypt("", "x"); err == nil {
		t.Fatal("empty key encrypted a secret")
	}
}
