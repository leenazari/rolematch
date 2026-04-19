import { NextRequest } from "next/server";
import { renderToStream, Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import { createElement } from "react";
import type { ResultsData, CVData } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = {
  cvData: CVData;
  results: ResultsData;
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
    color: "#4f46e5",
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
    fontSize: 18,
    fontWeight: "bold",
    color: "#4f46e5",
    marginBottom: 8,
    marginTop: 24,
    borderBottomWidth: 2,
    borderBottomColor: "#4f46e5",
    paddingBottom: 6,
  },
  summaryBox: {
    backgroundColor: "#eef2ff",
    padding: 16,
    borderRadius: 6,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: "#4f46e5",
  },
  summaryText: {
    fontSize: 11,
    lineHeight: 1.6,
    color: "#1e293b",
  },
  categoryHeader: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#4f46e5",
    marginTop: 20,
    marginBottom: 4,
  },
  categoryDescription: {
    fontSize: 10,
    color: "#64748b",
    marginBottom: 12,
    fontStyle: "italic",
  },
  roleCard: {
    marginBottom: 18,
    padding: 14,
    backgroundColor: "#f8fafc",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  roleTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#0f172a",
    marginBottom: 4,
  },
  unexpectedBox: {
    fontSize: 10,
    color: "#7c3aed",
    fontStyle: "italic",
    marginBottom: 8,
    backgroundColor: "#f5f3ff",
    padding: 6,
    borderRadius: 4,
  },
  consultantPara: {
    fontSize: 10.5,
    lineHeight: 1.5,
    color: "#334155",
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 3,
    marginTop: 8,
  },
  bulletItem: {
    fontSize: 10,
    color: "#334155",
    marginBottom: 2,
    paddingLeft: 8,
  },
  nextStep: {
    fontSize: 10,
    color: "#334155",
    backgroundColor: "#fef3c7",
    padding: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  salaryRow: {
    flexDirection: "row",
    marginTop: 10,
    gap: 8,
  },
  salaryTier: {
    flex: 1,
    padding: 8,
    borderRadius: 4,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  salaryTierActive: {
    flex: 1,
    padding: 8,
    borderRadius: 4,
    backgroundColor: "#eef2ff",
    borderWidth: 2,
    borderColor: "#4f46e5",
  },
  salaryTierLabel: {
    fontSize: 8,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 2,
  },
  salaryTierLabelActive: {
    fontSize: 8,
    color: "#4f46e5",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 2,
    fontWeight: "bold",
  },
  salaryTierValue: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#0f172a",
  },
  startingHere: {
    fontSize: 7,
    color: "#4f46e5",
    fontWeight: "bold",
    marginTop: 2,
  },
  caveat: {
    fontSize: 8,
    color: "#94a3b8",
    fontStyle: "italic",
    marginTop: 16,
    textAlign: "center",
  },
  ctaBox: {
    marginTop: 30,
    padding: 20,
    backgroundColor: "#4f46e5",
    borderRadius: 8,
    textAlign: "center",
  },
  ctaTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 6,
    textAlign: "center",
  },
  ctaText: {
    fontSize: 11,
    color: "#e0e7ff",
    textAlign: "center",
    lineHeight: 1.4,
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

const CATEGORY_LABELS = {
  pivot: "Roles you might not have considered",
  stretch: "Roles worth growing into",
  strong: "Roles you could walk into",
};

const CATEGORY_DESCRIPTIONS = {
  pivot: "Lateral moves into different sectors where your skills transfer in unexpected ways.",
  stretch: "Slightly above your current level or in adjacent sectors. Realistic with some growth.",
  strong: "Direct fits based on your experience and what you told us you want.",
};

function buildPdfDocument(cvData: CVData, results: ResultsData) {
  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const groupedRoles = {
    pivot: results.roles.filter((r) => r.category === "pivot"),
    stretch: results.roles.filter((r) => r.category === "stretch"),
    strong: results.roles.filter((r) => r.category === "strong"),
  };

  const renderRole = (role: any, idx: number) =>
    createElement(
      View,
      { key: `${role.category}-${idx}`, style: styles.roleCard, wrap: false },
      createElement(Text, { style: styles.roleTitle }, role.title),
      role.whyUnexpected
        ? createElement(Text, { style: styles.unexpectedBox }, "Why this could fit: " + role.whyUnexpected)
        : null,
      createElement(Text, { style: styles.consultantPara }, role.consultantParagraph),

      createElement(Text, { style: styles.fieldLabel }, "What you bring"),
      ...role.yourStrengths.map((s: string, i: number) =>
        createElement(Text, { key: `s-${i}`, style: styles.bulletItem }, "• " + s)
      ),

      createElement(Text, { style: styles.fieldLabel }, "What to develop"),
      ...role.developmentGaps.map((g: string, i: number) =>
        createElement(Text, { key: `g-${i}`, style: styles.bulletItem }, "• " + g)
      ),

      createElement(Text, { style: styles.fieldLabel }, "Suggested next step"),
      createElement(Text, { style: styles.nextStep }, role.nextStep),

      createElement(
        View,
        { style: styles.salaryRow },
        ...["entry", "established", "senior"].map((tier) => {
          const isActive = role.salary.startingTier === tier;
          const tierStyle = isActive ? styles.salaryTierActive : styles.salaryTier;
          const labelStyle = isActive ? styles.salaryTierLabelActive : styles.salaryTierLabel;
          return createElement(
            View,
            { key: tier, style: tierStyle },
            createElement(Text, { style: labelStyle }, tier),
            createElement(Text, { style: styles.salaryTierValue }, role.salary[tier]),
            isActive ? createElement(Text, { style: styles.startingHere }, "YOU START HERE") : null
          );
        })
      )
    );

  const renderCategorySection = (category: "pivot" | "stretch" | "strong") => {
    const roles = groupedRoles[category];
    if (roles.length === 0) return null;

    return createElement(
      View,
      { key: category },
      createElement(Text, { style: styles.categoryHeader }, CATEGORY_LABELS[category]),
      createElement(Text, { style: styles.categoryDescription }, CATEGORY_DESCRIPTIONS[category]),
      ...roles.map((role, idx) => renderRole(role, idx))
    );
  };

  return createElement(
    Document,
    {},
    // Cover page
    createElement(
      Page,
      { size: "A4", style: styles.page },
      createElement(Text, { style: styles.coverTitle }, "RoleMatch"),
      createElement(Text, { style: styles.coverSubtitle }, "Your personalised career direction report"),
      createElement(Text, { style: styles.coverName }, "Prepared for " + cvData.name),
      createElement(Text, { style: styles.coverMeta }, "Current role: " + cvData.currentRole),
      createElement(Text, { style: styles.coverMeta }, "Sector: " + cvData.sector),
      createElement(Text, { style: styles.coverMeta }, "Generated: " + today),
      createElement(
        View,
        { style: styles.footer, fixed: true },
        createElement(Text, {}, "rolematch.com  |  page 1")
      )
    ),

    // Summary + roles
    createElement(
      Page,
      { size: "A4", style: styles.page },
      createElement(Text, { style: styles.sectionHeader }, "What we heard from you"),
      createElement(
        View,
        { style: styles.summaryBox },
        createElement(Text, { style: styles.summaryText }, results.summary)
      ),
      createElement(Text, { style: styles.sectionHeader }, "Your role recommendations"),
      renderCategorySection("pivot"),
      renderCategorySection("stretch"),
      renderCategorySection("strong"),
      createElement(
        Text,
        { style: styles.caveat },
        "Salary ranges are estimates based on UK averages and can vary by region, employer, and your specific background. Use them as a guide, not a guarantee."
      ),
      createElement(
        View,
        { style: styles.ctaBox },
        createElement(Text, { style: styles.ctaTitle }, "Ready to practise interviewing for these roles?"),
        createElement(
          Text,
          { style: styles.ctaText },
          "RoleMatch is part of Interviewa. Practise real interviews with our AI interviewer, get instant feedback, and walk in confident on the day."
        )
      ),
      createElement(
        View,
        { style: styles.footer, fixed: true },
        createElement(Text, {}, "rolematch.com")
      )
    )
  );
}

export async function POST(req: NextRequest) {
  try {
    const body: Body = await req.json();
    const { cvData, results } = body;

    if (!cvData || !results) {
      return new Response(JSON.stringify({ ok: false, error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const doc = buildPdfDocument(cvData, results);
    const stream = await renderToStream(doc as any);

    const chunks: Buffer[] = [];
    for await (const chunk of stream as any) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const pdfBuffer = Buffer.concat(chunks);

    const safeName = cvData.name.replace(/[^a-zA-Z0-9]+/g, "_");

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="RoleMatch_${safeName}.pdf"`,
      },
    });
  } catch (e: any) {
    console.error("generate-pdf error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || "Failed to generate PDF" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
