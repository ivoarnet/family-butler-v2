import { Document, Page, PDFDownloadLink, StyleSheet, Text, View } from "@react-pdf/renderer";

export interface CalendarReportDay {
  date: string;
  label: string;
  memberEntries: Record<string, string[]>;
  sharedEntries: string[];
  specials: string[];
}

const styles = StyleSheet.create({
  page: { padding: 22, fontFamily: "Helvetica", color: "#172033" },
  heading: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  range: { fontSize: 9, color: "#5f6979", marginBottom: 14 },
  table: { borderTopWidth: 0.6, borderLeftWidth: 0.6, borderColor: "#c7cfdd" },
  row: { flexDirection: "row" },
  header: { backgroundColor: "#e9edf5" },
  label: { width: 112, flexShrink: 0, padding: 5, fontSize: 8, fontWeight: 700, borderRightWidth: 0.6, borderBottomWidth: 0.6, borderColor: "#c7cfdd" },
  cell: { flex: 1, minHeight: 44, padding: 4, fontSize: 7, lineHeight: 1.25, borderRightWidth: 0.6, borderBottomWidth: 0.6, borderColor: "#c7cfdd" },
  dayHeader: { minHeight: 24, textAlign: "center", fontSize: 8, fontWeight: 700, backgroundColor: "#e9edf5" },
  secondaryRow: { backgroundColor: "#f7f8fb" },
});

function CalendarReportDocument({ title, startDate, endDate, members, days }: {
  title: string;
  startDate: string;
  endDate: string;
  members: { id: string; name: string }[];
  days: CalendarReportDay[];
}) {
  const pages = Array.from({ length: Math.ceil(days.length / 7) }, (_, index) => days.slice(index * 7, index * 7 + 7));

  return (
    <Document title={title} author="Family Butler">
      {pages.map((week, weekIndex) => (
        <Page key={weekIndex} size="A3" orientation="landscape" style={styles.page} wrap={false}>
          <Text style={styles.heading}>{title}</Text>
          <Text style={styles.range}>{startDate} – {endDate}</Text>
          <View style={styles.table}>
            <View style={[styles.row, styles.header]}>
              <Text style={styles.label}>Member</Text>
              {week.map((day) => <Text key={day.date} style={[styles.cell, styles.dayHeader]}>{day.label}</Text>)}
            </View>
            {members.map((member) => (
              <View key={member.id} style={styles.row} wrap={false}>
                <Text style={styles.label}>{member.name}</Text>
                {week.map((day) => (
                  <Text key={day.date} style={styles.cell}>
                    {(day.memberEntries[member.id] ?? []).join("\n")}
                  </Text>
                ))}
              </View>
            ))}
            <View style={[styles.row, styles.secondaryRow]} wrap={false}>
              <Text style={styles.label}>Shared</Text>
              {week.map((day) => <Text key={day.date} style={styles.cell}>{day.sharedEntries.join("\n")}</Text>)}
            </View>
            <View style={[styles.row, styles.secondaryRow]} wrap={false}>
              <Text style={styles.label}>Specials</Text>
              {week.map((day) => <Text key={day.date} style={styles.cell}>{day.specials.join("\n")}</Text>)}
            </View>
          </View>
        </Page>
      ))}
    </Document>
  );
}

export function CalendarReportPdf({ startDate, endDate, members, days }: {
  startDate: string;
  endDate: string;
  members: { id: string; name: string }[];
  days: CalendarReportDay[];
}) {
  const title = "Family calendar";
  return (
    <PDFDownloadLink
      document={<CalendarReportDocument title={title} startDate={startDate} endDate={endDate} members={members} days={days} />}
      fileName={`family-calendar-${startDate}-to-${endDate}.pdf`}
      className="calendar-pdf-download"
      aria-label={`Download calendar report from ${startDate} to ${endDate} as PDF`}
    >
      {({ loading }) => loading ? "Preparing PDF…" : "Download PDF"}
    </PDFDownloadLink>
  );
}
