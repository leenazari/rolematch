import { NextRequest } from "next/server";
import { renderToStream, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { createElement } from "react";
import type { PitchData, PitchCritique } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = {
  pitchData: PitchData;
  critique: PitchCritique;
  generatedAt?: string;
};

const styles = StyleSheet.create({
  page: {
    padding: 50,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#1e293b",
  },
  coverTitle: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#7c3aed",
    marginBottom: 12,
    marginTop: 100,
  },
  coverSubtitle: {
    fontSize: 16,
    color: "#475569",
    marginBottom: 60,
  },
  coverName: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#0f172a",
  },
  coverMeta: {
    fontSize: 11,
    color: "#64748b",
    marginBottom: 4,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#7c3aed",
    marginBottom: 8,
    marginTop: 20,
    borderBottomWidth: 2,
    borderBottomColor: "#7c3aed",
    paddingBottom: 4,
  },
  verdictBox: {
    backgroundColor: "#f5f3ff",
    padding: 14,
    borderRadius: 6,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: "#7c3aed",
  },
  verdictText: {
    fontSize: 11,
    lineHeight: 1.6,
    color: "#1e293b",
  },
  twoColumnRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  column: {
    flex: 1,
    padding: 12,
    borderRadius: 6,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  columnLabelGreen: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#15803d",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  columnLabelAmber: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#b45309",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  bulletItem: {
    fontSize: 10,
    color: "#334155",
    marginBottom: 6,
    lineHeight: 1.4,
  },
  fatalBox: {
    backgroundColor: "#fef2f2",
    padding: 14,
    borderRadius: 6,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "#fca5a5",
  },
  fatalLabel: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#991b1b",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  fatalText: {
    fontSize: 11,
    color: "#7f1d1d",
    lineHeight: 1.5,
  },
  sectorBox: {
    backgroundColor: "#f8fafc",
    padding: 12,
    borderRadius: 6,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  revisedBox: {
    backgroundColor: "#f5f3ff",
    padding: 14,
    borderRadius: 6,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#ddd6fe",
  },
  revisedLabel: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#7c3aed",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  revisedText: {
    fontSize: 11,
    color: "#1e293b",
    lineHeight: 1.6,
    fontStyle: "italic",
  },
  actionsBox: {
    marginBottom: 16,
  },
  actionItem: {
    flexDirection: "row",
    marginBottom: 8,
  },
  actionNumber: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#7c3aed",
    width: 20,
  },
  actionText: {
    flex: 1,
    fontSize: 10,
    color: "#334155",
    lineHeight: 1.5,
  },
  questionBox: {
    borderLeftWidth: 2,
    borderLeftColor: "#c4b5fd",
    paddingLeft: 10,
    marginBottom: 12,
  },
  questionText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#0f172a",
    marginBottom: 3,
  },
  questionGuidance: {
    fontSize: 9,
    color: "#64748b",
    lineHeight: 1.4,
  },
  timestampLine: {
    fontSize: 8,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 16,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 50,
    right: 50,
    fontSize: 8,
    color: "#94a3b8",
    textAlign: "center",
  },
});

function formatTimestamp(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const day = d.getDate();
    const month = d.toLocaleDateString("en-GB", { month: "long" });
    const year = d.getFullYear();
    const hours = d.getHours().toString().padStart(2, "0");
    const minutes = d.getMinutes().toString().padStart(2, "0");
    return day + " " + month + " " + year + ", " + hours + ":" + minutes;
  } catch (e) {
    return "";
  }
}

function buildPdfDocument(pitchData: PitchData, critique: PitchCritique, generatedAt: string) {
  const formattedTimestamp = generatedAt
    ? formatTimestamp(generatedAt)
    : formatTimestamp(new Date().toISOString());

  const renderStrong = function () {
    return createElement(
      View,
      { style: styles.column },
      createElement(Text, { style: styles.columnLabelGreen }, "What's strong"),
      ...critique.strong.map(function (item: string, i: number) {
        return createElement(Text, { key: "strong-" + i, style: styles.bulletItem }, "+ " + item);
      })
    );
  };

  const renderWeak = function () {
    return createElement(
      View,
      { style: styles.column },
      createElement(Text, { style: styles.columnLabelAmber }, "What's weak"),
      ...critique.weak.map(function (item: string, i: number) {
        return createElement(Text, { key: "weak-" + i, style: styles.bulletItem }, "! " + item);
      })
    );
  };

  const renderFatalFlaw = function () {
    if (!critique.fatalFlaw) return null;
    return createElement(
      View,
      { style: styles.fatalBox, key: "fatal" },
      createElement(Text, { style: styles.fatalLabel }, "The fatal flaw"),
      createElement(Text, { style: styles.fatalText }, critique.fatalFlaw)
    );
  };

  const renderSectorConcerns = function () {
    if (!critique.sectorConcerns || critique.sectorConcerns.length === 0) return null;
    return createElement(
      View,
      { key: "sector" },
      createElement(Text, { style: styles.sectionHeader }, "Sector specific concerns"),
      createElement(
        View,
        { style: styles.sectorBox },
        ...critique.sectorConcerns.map(function (item: string, i: number) {
          return createElement(Text, { key: "sc-" + i, style: styles.bulletItem }, "> " + item);
        })
      )
    );
  };

  const renderActions = function () {
    return critique.thirtyDayActions.map(function (item: string, i: number) {
      return createElement(
        View,
        { key: "action-" + i, style: styles.actionItem },
        createElement(Text, { style: styles.actionNumber }, (i + 1) + "."),
        createElement(Text, { style: styles.actionText }, item)
      );
    });
  };

  const renderVcQuestions = function () {
    return critique.vcQuestions.map(function (q: any, i: number) {
      return createElement(
        View,
        { key: "vc-" + i, style: styles.questionBox, wrap: false },
        createElement(Text, { style: styles.questionText }, q.question),
        createElement(Text, { style: styles.questionGuidance }, q.prepGuidance)
      );
    });
  };

  return createElement(
    Document,
    {},
    createElement(
      Page,
      { size: "A4", style: styles.page, key: "cover" },
      createElement(Text, { style: styles.coverTitle }, "Pitch Perfect"),
      createElement(Text, { style: styles.coverSubtitle }, "Your honest pitch and business critique"),
      createElement(Text, { style: styles.coverName }, "Prepared for " + pitchData.companyName),
      createElement(Text, { style: styles.coverMeta }, "One-liner: " + pitchData.oneLineDescription),
      createElement(Text, { style: styles.coverMeta }, "Sector: " + pitchData.sector),
      createElement(Text, { style: styles.coverMeta }, "Stage: " + pitchData.stage),
      createElement(Text, { style: styles.coverMeta }, "Ask: " + pitchData.ask),
      createElement(Text, { style: styles.coverMeta }, "Generated: " + formattedTimestamp),
      createElement(
        View,
        { style: styles.footer, fixed: true },
        createElement(Text, {}, "Pitch Perfect  |  page 1")
      )
    ),

    createElement(
      Page,
      { size: "A4", style: styles.page, key: "main" },
      createElement(Text, { style: styles.sectionHeader }, "Verdict"),
      createElement(
        View,
        { style: styles.verdictBox },
        createElement(Text, { style: styles.verdictText }, critique.verdict)
      ),

      createElement(Text, { style: styles.sectionHeader }, "Strong and weak points"),
      createElement(
        View,
        { style: styles.twoColumnRow },
        renderStrong(),
        renderWeak()
      ),

      renderFatalFlaw(),

      renderSectorConcerns(),

      createElement(Text, { style: styles.sectionHeader }, "How I would tell this story"),
      createElement(
        View,
        { style: styles.revisedBox },
        createElement(Text, { style: styles.revisedLabel }, "Revised pitch"),
        createElement(Text, { style: styles.revisedText }, '"' + critique.revisedPitch + '"')
      ),

      createElement(
        View,
        { style: styles.footer, fixed: true },
        createElement(Text, {}, "Pitch Perfect  |  page 2")
      )
    ),

    createElement(
      Page,
      { size: "A4", style: styles.page, key: "actions" },
      createElement(Text, { style: styles.sectionHeader }, "Next 30 days"),
      createElement(View, { style: styles.actionsBox }, ...renderActions()),

      createElement(Text, { style: styles.sectionHeader }, "Questions a real VC will ask"),
      createElement(View, {}, ...renderVcQuestions()),

      createElement(
        Text,
        { style: styles.timestampLine },
        "Generated: " + formattedTimestamp
      ),
      createElement(
        View,
        { style: styles.footer, fixed: true },
        createElement(Text, {}, "Pitch Perfect  |  page 3")
      )
    )
  );
}

export async function POST(req: NextRequest) {
  try {
    const body: Body = await req.json();
    const { pitchData, critique, generatedAt } = body;

    if (!pitchData || !critique) {
      return new Response(JSON.stringify({ ok: false, error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const doc = buildPdfDocument(pitchData, critique, generatedAt || "");
    const stream = await renderToStream(doc as any);

    const chunks: Buffer[] = [];
    for await (const chunk of stream as any) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const pdfBuffer = Buffer.concat(chunks);

    const safeName = pitchData.companyName.replace(/[^a-zA-Z0-9]+/g, "_");

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"PitchPerfect_" + safeName + ".pdf\"",
      },
    });
  } catch (e: any) {
    console.error("generate-pitch-pdf error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || "Failed to generate PDF" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
