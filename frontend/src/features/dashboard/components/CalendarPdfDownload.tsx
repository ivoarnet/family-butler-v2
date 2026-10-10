import { Document, Page, PDFDownloadLink, StyleSheet, Text, View } from "@react-pdf/renderer";

export interface CalendarPdfDay {
  date: number;
  isInMonth: boolean;
  isToday: boolean;
  events: string[];
  specials: string[];
  notes: string[];
}

const styles = StyleSheet.create({
  page: { padding: 18, fontFamily: "Helvetica", color: "#172033" },
  heading: { fontSize: 19, fontWeight: 700, marginBottom: 10 },
  weekdayRow: { flexDirection: "row", backgroundColor: "#e9edf5" },
  weekday: { flex: 1, padding: 5, fontSize: 8, fontWeight: 700, textAlign: "center" },
  weekRow: { flexDirection: "row", flexGrow: 1 },
  day: { flex: 1, minHeight: 34, padding: 4, borderWidth: 0.5, borderColor: "#c7cfdd" },
  outsideDay: { color: "#8992a2", backgroundColor: "#f5f6f8" },
  today: { backgroundColor: "#eaf2ff", borderColor: "#3974c6" },
  date: { fontSize: 8, fontWeight: 700, marginBottom: 2 },
  entry: { fontSize: 8, lineHeight: 1.2, marginBottom: 2 },
  special: { fontSize: 7.5, lineHeight: 1.2, color: "#315d55", marginBottom: 2 },
  note: { fontSize: 7, lineHeight: 1.2, color: "#7b4e16", marginBottom: 2 },
});

function MonthlyCalendarDocument({ monthLabel, weekdays, days }: {
  monthLabel: string;
  weekdays: string[];
  days: CalendarPdfDay[];
}) {
  const weeks = Array.from({ length: Math.ceil(days.length / 7) }, (_, index) => days.slice(index * 7, index * 7 + 7));

  return (
    <Document title={monthLabel} author="Family Butler">
      <Page size="A3" orientation="landscape" style={styles.page}>
        <Text style={styles.heading}>{monthLabel}</Text>
        <View style={styles.weekdayRow}>
          {weekdays.map((weekday) => <Text key={weekday} style={styles.weekday}>{weekday}</Text>)}
        </View>
        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={styles.weekRow}>
            {week.map((day) => (
              <View key={`${weekIndex}-${day.date}`} style={[
                styles.day,
                !day.isInMonth ? styles.outsideDay : undefined,
                day.isToday ? styles.today : undefined,
              ]}>
                <Text style={styles.date}>{day.date}</Text>
                {day.notes.map((note, index) => <Text key={`note-${index}`} style={styles.note}>{note}</Text>)}
                {day.events.map((event, index) => <Text key={`event-${index}`} style={styles.entry}>{event}</Text>)}
                {day.specials.map((special, index) => <Text key={`special-${index}`} style={styles.special}>{special}</Text>)}
              </View>
            ))}
          </View>
        ))}
      </Page>
    </Document>
  );
}

export function CalendarPdfDownload({ monthLabel, fileName, weekdays, days }: {
  monthLabel: string;
  fileName: string;
  weekdays: string[];
  days: CalendarPdfDay[];
}) {
  return (
    <PDFDownloadLink
      document={<MonthlyCalendarDocument monthLabel={monthLabel} weekdays={weekdays} days={days} />}
      fileName={fileName}
      className="calendar-pdf-download"
      aria-label={`Download ${monthLabel} calendar as PDF`}
    >
      {({ loading }) => loading ? "Preparing PDF…" : "Download PDF"}
    </PDFDownloadLink>
  );
}
