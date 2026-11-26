import Link from "next/link";

export default function Shell({ children, headerSearch }: { children: React.ReactNode; headerSearch?: React.ReactNode }) {
  return (
    <>
      <header className="site-header">
        <div className="container inner">
          <Link className="wordmark" href="/">ציונים <span>· בן-גוריון</span></Link>
          {headerSearch && <div className="header-search" data-tour="search">{headerSearch}</div>}
          <Link className="nav-link" href="/guide" data-tour="guide">איך זה עובד</Link>
        </div>
      </header>
      <main>{children}</main>
      <footer className="site-footer">
        <div className="container">
          <p>
            האתר אינו אתר רשמי של אוניברסיטת בן-גוריון. · <Link href="/guide">הסבר על האתר</Link>
          </p>
        </div>
      </footer>
    </>
  );
}
