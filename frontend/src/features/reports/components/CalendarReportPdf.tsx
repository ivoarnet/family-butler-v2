import { Document, Page, PDFDownloadLink, StyleSheet, Text, View } from "@react-pdf/renderer";

export interface CalendarReportDay {
  date: string;
  label: string;
  inRange: boolean;
  memberEntries: Record<string, string[]>;
  sharedEntries: string[];
  specials: string[];
}

export interface CalendarReportMonth {
  key: string;
  label: string;
  days: CalendarReportDay[];
}

const styles = StyleSheet.create({
  page: { padding: 18, fontFamily: "Helvetica", color: "#172033" },
  heading: { fontSize: 17, fontWeight: 700, marginBottom: 3 },
  range: { fontSize: 8, color: "#5f6979", marginBottom: 8 },
  table: { borderTopWidth: 0.6, borderLeftWidth: 0.6, borderColor: "#c7cfdd", flexGrow: 1 },
  row: { flexDirection: "row" },
  header: { backgroundColor: "#e9edf5" },
  date: { width: 48, height: 32, flexShrink: 0, padding: 3, fontSize: 7, fontWeight: 700, borderRightWidth: 0.6, borderBottomWidth: 0.6, borderColor: "#c7cfdd" },
  dateHeader: { textAlign: "left", fontSize: 7, backgroundColor: "#e9edf5" },
  cell: { flex: 1, minWidth: 0, height: 32, padding: 3, fontSize: 7, lineHeight: 1.1, borderRightWidth: 0.6, borderBottomWidth: 0.6, borderColor: "#c7cfdd" },
  memberHeader: { textAlign: "center", fontSize: 7, fontWeight: 700, backgroundColor: "#e9edf5" },
  secondaryHeader: { textAlign: "center", fontSize: 6, fontWeight: 700, backgroundColor: "#e9edf5" },
  outsideRange: { color: "#a0a7b2", backgroundColor: "#f5f6f8" },
  secondaryRow: { backgroundColor: "#f7f8fb" },
});

const cellText = (entries: string[]): string => {
  const visibleEntries = entries.slice(0, 2).map((entry) =>
    entry.length > 25 ? `${entry.slice(0, 24)}…` : entry);
  if (entries.length > visibleEntries.length) visibleEntries.push(`+${entries.length - visibleEntries.length} more`);
  return visibleEntries.join("\n");
};

function CalendarReportDocument({ title, startDate, endDate, members, months }: {
  title: string;
  startDate: string;
  endDate: string;
  members: { id: string; name: string }[];
  months: CalendarReportMonth[];
}) {
  return (
    <Document title={title} author="Family Butler">
      {months.map((month) => (
        <Page key={month.key} size="A3" orientation="portrait" style={styles.page}>
          <Text style={styles.heading}>{month.label} · {title}</Text>
          <Text style={styles.range}>{startDate} – {endDate}</Text>
          <View style={styles.table}>
            <View style={[styles.row, styles.header]}>
              <Text style={[styles.date, styles.dateHeader]}>Day</Text>
              {members.map((member) => <Text key={member.id} style={[styles.cell, styles.memberHeader]}>{member.name}</Text>)}
              <Text style={[styles.cell, styles.secondaryHeader]}>Events</Text>
              <Text style={[styles.cell, styles.secondaryHeader]}>Specials</Text>
            </View>
            {month.days.map((day) => (
              <View key={day.date} style={styles.row} wrap={false}>
                <Text style={[styles.date, !day.inRange ? styles.outsideRange : undefined]}>{day.label}</Text>
                {members.map((member) => (
                  <Text key={member.id} style={[styles.cell, !day.inRange ? styles.outsideRange : undefined]}>
                    {cellText(day.memberEntries[member.id] ?? [])}
                  </Text>
                ))}
                <Text style={[styles.cell, styles.secondaryRow, !day.inRange ? styles.outsideRange : undefined]}>
                  {cellText(day.sharedEntries)}
                </Text>
                <Text style={[styles.cell, styles.secondaryRow, !day.inRange ? styles.outsideRange : undefined]}>
                  {cellText(day.specials)}
                </Text>
              </View>
            ))}
          </View>
        </Page>
      ))}
    </Document>
  );
}

export function CalendarReportPdf({ startDate, endDate, members, months }: {
  startDate: string;
  endDate: string;
  members: { id: string; name: string }[];
  months: CalendarReportMonth[];
}) {
  const title = "Family calendar";
  return (
    <PDFDownloadLink
      document={<CalendarReportDocument title={title} startDate={startDate} endDate={endDate} members={members} months={months} />}
      fileName={`family-calendar-${startDate}-to-${endDate}.pdf`}
      className="calendar-pdf-download"
      aria-label={`Download calendar report from ${startDate} to ${endDate} as PDF`}
    >
      {({ loading }) => loading ? "Preparing PDF…" : "Download PDF"}
    </PDFDownloadLink>
  );
}
