import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { ReceiptData } from "@/lib/actions/invoices";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  credit: "Credit",
};

/**
 * Server-rendered A5 invoice, for emailing and downloading.
 *
 * This re-declares the bill's layout rather than reusing ReceiptView: that
 * component is HTML/Tailwind and react-pdf renders its own primitives, so
 * there is no way to share one tree. The two must be kept in step by hand —
 * the A5 screen layout is the reference.
 *
 * Amounts read "Rs." rather than "₹": react-pdf's built-in Helvetica has no
 * rupee glyph and would print a blank box. Registering a Unicode font would
 * fix it — see README.
 */
const MAROON = "#6E1B3A";
const GOLD = "#D98E2B";

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: "Helvetica", color: "#2A2A2A" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { width: 78, height: 25, objectFit: "contain", marginBottom: 4 },
  pharmacyName: { fontSize: 10, fontWeight: "bold", marginBottom: 3 },
  title: { fontSize: 10, fontFamily: "Helvetica-Bold", letterSpacing: 2, textAlign: "center" },
  reg: { textAlign: "right" },
  rule: { borderBottomWidth: 1, borderBottomColor: "#CFC7BB", marginVertical: 6 },
  metaRow: { flexDirection: "row", justifyContent: "space-between" },
  th: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#8A8178",
    paddingVertical: 3,
    fontFamily: "Helvetica-Bold",
  },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#DED6CA", paddingVertical: 3 },
  sub: { fontSize: 6.5, color: "#6B6259" },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1 },
  grand: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 4,
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
  },
  footer: { textAlign: "center", fontSize: 7, lineHeight: 1.5 },
  // Joined onto one line rather than stacked: A5 is tight, and this note
  // sits above the item table where every millimetre costs a row.
  headerNote: { textAlign: "center", fontSize: 7, fontStyle: "italic", marginTop: 3 },
  termsHead: { fontSize: 7, fontFamily: "Helvetica-Bold", marginBottom: 1 },
});

// Column widths as flex ratios, mirroring the on-screen A5 table.
const COLS = [0.5, 3.1, 1.7, 1.6, 1, 0.7, 1.2, 1.2, 0.8, 1.6];
const money = (n: number) => n.toFixed(2);

export function InvoicePdf({ data, logo }: { data: ReceiptData; logo?: string }) {
  const licences = [data.branch.drugLicenseRetailNo, data.branch.drugLicenseWholesaleNo].filter(
    Boolean
  );
  const contacts = [data.branch.landline, data.branch.phone].filter(Boolean);

  return (
    <Document title={`Invoice ${data.invoiceNo}`}>
      <Page size="A5" style={s.page}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            {logo ? (
              <Image src={logo} style={s.logo} />
            ) : (
              /* With the logo off the pharmacy name takes its place, so a
                 PDF bill never arrives without a heading. */
              <Text style={s.pharmacyName}>{data.tenant.pharmacyName}</Text>
            )}
            <Text>{data.branch.licensedAddress}</Text>
          </View>
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Text style={s.title}>GST INVOICE</Text>
          </View>
          {/* One Text per line: newlines inside a single Text render with
              runaway leading in react-pdf, and a joined phone list wraps
              mid-number in a column this narrow. */}
          <View style={{ flex: 1.2 }}>
            {contacts.map((c) => (
              <Text key={c} style={s.reg}>
                Ph: {c}
              </Text>
            ))}
            {data.branch.gstin && <Text style={s.reg}>GSTIN: {data.branch.gstin}</Text>}
            {licences.length > 0 && <Text style={s.reg}>DL: {licences.join(", ")}</Text>}
            {data.branch.fssaiNo && <Text style={s.reg}>FSSAI: {data.branch.fssaiNo}</Text>}
          </View>
        </View>

        {data.tenant.invoiceHeaderText ? (
          <Text style={s.headerNote}>
            {data.tenant.invoiceHeaderText
              .split("|")
              .map((l) => l.trim())
              .filter(Boolean)
              .join("  ·  ")}
          </Text>
        ) : null}

        <View style={s.rule} />
        <View style={s.metaRow}>
          <Text>Invoice: {data.invoiceNo}</Text>
          <Text>Payment: {PAYMENT_LABELS[data.paymentMode] ?? data.paymentMode}</Text>
          <Text>{new Date(data.invoiceDate).toLocaleString("en-IN")}</Text>
        </View>
        <View style={s.rule} />

        <View style={s.th}>
          {["#", "Product", "Pack", "Batch", "Exp.", "Qty", "MRP", "Rate", "GST%", "Amount"].map(
            (h, i) => (
              <Text
                key={h}
                style={{ flex: COLS[i], textAlign: i >= 5 ? "right" : "left", paddingRight: 2 }}
              >
                {h}
              </Text>
            )
          )}
        </View>

        {data.items.map((line, i) => (
          <View key={line.id} style={s.tr}>
            <View style={{ flex: COLS[0] }}>
              <Text>{i + 1}</Text>
            </View>
            <View style={{ flex: COLS[1], paddingRight: 2 }}>
              <Text>{line.itemName}</Text>
              <Text style={s.sub}>
                {[line.manufacturer, line.hsnCode ? `HSN ${line.hsnCode}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
            <Text style={{ flex: COLS[2], fontSize: 7 }}>{line.packSize ?? "-"}</Text>
            <Text style={{ flex: COLS[3] }}>{line.batchNo}</Text>
            <Text style={{ flex: COLS[4] }}>
              {line.expiryDate
                ? new Date(line.expiryDate).toLocaleDateString("en-IN", {
                    month: "2-digit",
                    year: "2-digit",
                  })
                : "-"}
            </Text>
            <Text style={{ flex: COLS[5], textAlign: "right" }}>{line.qty}</Text>
            <Text style={{ flex: COLS[6], textAlign: "right" }}>
              {line.mrp === null ? "-" : money(line.mrp)}
            </Text>
            <Text style={{ flex: COLS[7], textAlign: "right" }}>{money(line.rate)}</Text>
            <Text style={{ flex: COLS[8], textAlign: "right" }}>{line.taxRate}</Text>
            <Text
              style={{ flex: COLS[9], textAlign: "right", fontFamily: "Helvetica-Bold" }}
            >
              {money(line.lineTotal)}
            </Text>
          </View>
        ))}

        <View style={{ marginTop: 8, marginLeft: "auto", width: "55%" }}>
          <View style={s.totalsRow}>
            <Text>Subtotal</Text>
            <Text>Rs. {money(data.subtotal)}</Text>
          </View>
          {data.discountAmount > 0 && (
            <View style={s.totalsRow}>
              <Text>Discount</Text>
              <Text>- Rs. {money(data.discountAmount)}</Text>
            </View>
          )}
          <View style={s.totalsRow}>
            <Text>CGST</Text>
            <Text>Rs. {money(data.taxAmount / 2)}</Text>
          </View>
          <View style={s.totalsRow}>
            <Text>SGST</Text>
            <Text>Rs. {money(data.taxAmount - data.taxAmount / 2)}</Text>
          </View>
          {data.roundOffAmount !== 0 && (
            <View style={s.totalsRow}>
              <Text>Round off</Text>
              <Text>
                {data.roundOffAmount < 0 ? "- " : "+ "}Rs. {money(Math.abs(data.roundOffAmount))}
              </Text>
            </View>
          )}
          <View style={{ ...s.grand, borderTopWidth: 1, borderColor: MAROON }}>
            <Text>Total</Text>
            <Text style={{ color: MAROON }}>Rs. {money(data.total)}</Text>
          </View>
        </View>

        {(data.doctor || data.patientName) && (
          <>
            <View style={s.rule} />
            <View>
              {data.doctor && (
                <Text>
                  {data.doctor.name}
                  {data.doctor.registrationNo ? ` (Reg. No. ${data.doctor.registrationNo})` : ""}
                  {data.doctor.phone ? ` · ${data.doctor.phone}` : ""}
                </Text>
              )}
              {data.patientName && (
                <Text>
                  Patient: {data.patientName}
                  {data.patientAge ? `, Age ${data.patientAge}` : ""}
                </Text>
              )}
              {data.patientPhone && <Text>Patient phone: {data.patientPhone}</Text>}
              {data.patientAddress && <Text>Address: {data.patientAddress}</Text>}
            </View>
          </>
        )}

        {data.tenant.invoiceFooterText && (
          <>
            <View style={s.rule} />
            <Text style={s.footer}>
              {data.tenant.invoiceFooterText
                .split("|")
                .map((l) => l.trim())
                .filter(Boolean)
                .join("  ·  ")}
            </Text>
          </>
        )}

        {data.tenant.invoiceTermsText && (
          <View style={{ marginTop: 6, borderTopWidth: 1, borderColor: GOLD, paddingTop: 4 }}>
            <Text style={s.termsHead}>Terms &amp; Conditions</Text>
            <Text style={{ fontSize: 6.5 }}>
              {data.tenant.invoiceTermsText
                .split("|")
                .map((t) => t.trim())
                .filter(Boolean)
                .join("  ·  ")}
            </Text>
          </View>
        )}
      </Page>
    </Document>
  );
}
