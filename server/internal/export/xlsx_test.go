package export

import (
	"testing"

	"lianpu/server/internal/model"
	"lianpu/server/internal/rainforest"
)

func TestCellMapping(t *testing.T) {
	row := Row{
		URL: "https://www.amazon.com/dp/B000000001",
		Product: rainforest.Product{
			Title:   "Mug",
			Images:  []string{"https://images.example/0.jpg", "https://images.example/1.jpg"},
			Specs:   map[string]string{"Material": "Steel"},
			Bullets: []string{"One", "Two"},
		},
	}
	if got := Cell(row, model.ExportColumn{SourceKind: SourceImage, SourceKey: "1"}); got != "https://images.example/1.jpg" {
		t.Fatalf("image = %q", got)
	}
	if got := Cell(row, model.ExportColumn{SourceKind: SourceImage, SourceKey: "8"}); got != "" {
		t.Fatalf("missing image = %q", got)
	}
	if got := Cell(row, model.ExportColumn{SourceKind: SourceSpec, SourceKey: "material"}); got != "Steel" {
		t.Fatalf("spec = %q", got)
	}
	if got := Cell(row, model.ExportColumn{SourceKind: SourceSpec, SourceKey: "Missing"}); got != "" {
		t.Fatalf("missing spec = %q", got)
	}
	if got := Cell(row, model.ExportColumn{SourceKind: SourceBullets}); got != "One\nTwo" {
		t.Fatalf("bullets = %q", got)
	}
	if !ValidColumn(SourceImage, "0") || ValidColumn(SourceImage, "9") || ValidColumn(SourceSpec, "") || ValidColumn("script", "") {
		t.Fatal("source validation mismatch")
	}
}
