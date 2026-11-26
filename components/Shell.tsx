import Link from "next/link";
import { FAIL_THRESHOLD } from "@/lib/stats";

export default function Shell({ children, headerSearch }: { children: React.ReactNode; headerSearch?: React.ReactNode }) {
  return (
    <>
      <header className="site-header">
        <div className="container inner">
          <Link className="wordmark" href="/">ציונים <span>· בן-גוריון</span></Link>
          {headerSearch && <div className="header-search">{headerSearch}</div>}
          <Link className="nav-link" href="/guide">איך זה עובד</Link>
        </div>
      </header>
      <main>{children}</main>
      <footer className="site-footer">
        <div className="container">
          <p>
            הנתונים נשלפים ממערכת הדוחות ומקובץ הקורסים הציבוריים של אוניברסיטת בן-גוריון. האתר אינו אתר רשמי של האוניברסיטה.{" "}
            <Link href="/guide">הסבר על האתר והנתונים</Link>
          </p>
          <p>סמסטרים עם פחות מ־5 נבחנים מוסתרים. ציון מעבר: {FAIL_THRESHOLD}.</p>
        </div>
      </footer>
    </>
  );
}
