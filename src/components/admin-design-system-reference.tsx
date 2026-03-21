import { Layers3, Sparkles } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

export function AdminDesignSystemReference() {
  return (
    <Card className="bg-(--panel)">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-(--border) bg-(--panel-soft) text-(--brand)">
            <Layers3 className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-2xl">Design system</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-3 md:grid-cols-4">
          {[
            { label: "Background", value: "var(--bg)" },
            { label: "Panel", value: "var(--panel)" },
            { label: "Brand", value: "var(--brand)" },
            { label: "Accent", value: "var(--brand-deep)" },
          ].map((token, index) => (
            <div
              key={token.label}
              className="rounded-[22px] border border-(--border) p-4"
            >
              <div
                className="h-16 rounded-[18px] border border-(--border)"
                style={{
                  background:
                    index === 0
                      ? "var(--bg)"
                      : index === 1
                        ? "var(--panel)"
                        : index === 2
                          ? "var(--brand)"
                          : "var(--brand-deep)",
                }}
              />
              <p className="mt-3 text-sm font-medium text-(--text)">
                {token.label}
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-(--muted)">
                {token.value}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-[24px] border border-(--border) bg-(--panel-soft) p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-(--muted)">
              Buttons + badges
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button size="lg">Primary action</Button>
              <Button variant="outline" size="lg">
                Secondary
              </Button>
              <Button variant="ghost" size="lg">
                Ghost
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge>Admin</Badge>
              <Badge variant="secondary">Search result</Badge>
              <Badge variant="outline">Neutral</Badge>
            </div>
          </div>

          <div className="rounded-[24px] border border-(--border) bg-(--panel-soft) p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-(--muted)">
              Inputs + selection
            </p>
            <div className="mt-4 grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="design-preview-search">Search field</Label>
                <Input
                  id="design-preview-search"
                  defaultValue="Smashing Pumpkins"
                />
              </div>
              <div className="grid gap-2">
                <Label>Sort order</Label>
                <Select defaultValue="relevance">
                  <SelectTrigger>
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="relevance">Best match</SelectItem>
                    <SelectItem value="artist">Artist</SelectItem>
                    <SelectItem value="updated">Recently updated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-(--border) bg-(--panel-soft) p-5">
          <div className="flex items-center gap-3">
            <Sparkles className="h-4 w-4 text-(--brand)" />
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-(--muted)">
              Dense result row
            </p>
          </div>
          <div className="mt-4 overflow-hidden rounded-[22px] border border-(--border)">
            <div className="grid grid-cols-[minmax(0,2.1fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_72px] gap-4 bg-(--panel-muted) px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-(--muted)">
              <span>Track</span>
              <span>Album / Creator</span>
              <span>Tuning / Path</span>
              <span>Stats</span>
              <span className="text-right">Copy</span>
            </div>
            <div className="grid grid-cols-[minmax(0,2.1fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_72px] gap-4 bg-(--panel-strong) px-4 py-4">
              <div>
                <p className="font-semibold text-(--text)">Cherub Rock</p>
                <p className="mt-1 text-sm text-(--brand-deep)">
                  Smashing Pumpkins
                </p>
              </div>
              <div>
                <p className="text-sm text-(--text)">Siamese Dream</p>
                <p className="mt-1 text-sm text-(--muted)">
                  Charted by ExampleUser
                </p>
              </div>
              <div>
                <p className="text-sm text-(--text)">Eb Standard</p>
                <p className="mt-1 text-sm text-(--muted)">
                  Lead, Rhythm, Bass
                </p>
              </div>
              <div>
                <p className="text-sm text-(--text)">4:57</p>
              </div>
              <div className="flex items-center justify-end">
                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-(--border) bg-(--panel) text-(--brand)">
                  Copy
                </div>
              </div>
            </div>
            <div className="grid grid-cols-[minmax(0,2.1fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_72px] gap-4 bg-(--panel-soft) px-4 py-4">
              <div>
                <p className="font-semibold text-(--text)">Mayonaise</p>
                <p className="mt-1 text-sm text-(--brand-deep)">
                  Smashing Pumpkins
                </p>
              </div>
              <div>
                <p className="text-sm text-(--text)">Siamese Dream</p>
                <p className="mt-1 text-sm text-(--muted)">
                  Charted by ExampleUser
                </p>
              </div>
              <div>
                <p className="text-sm text-(--text)">Eb Standard</p>
                <p className="mt-1 text-sm text-(--muted)">Lead, Rhythm</p>
              </div>
              <div>
                <p className="text-sm text-(--text)">6:55</p>
              </div>
              <div className="flex items-center justify-end">
                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-(--border) bg-(--panel) text-(--brand)">
                  Copy
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
