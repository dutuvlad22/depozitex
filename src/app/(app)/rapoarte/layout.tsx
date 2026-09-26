import ReportTabs from "@/components/reports/report-tabs";

export default function RapoarteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="stack">
      <ReportTabs />
      {children}
    </div>
  );
}
