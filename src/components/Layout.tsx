import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

export interface LayoutProps {
  /** Header title (any node; screens put their own date switcher here). */
  title: ReactNode;
  /** Optional right-aligned header content. */
  actions?: ReactNode;
  children: ReactNode;
}

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const NAV = [
  { to: '/', label: 'Today', end: true, d: 'M4 12l8-8 8 8M6 10v10h12V10' },
  { to: '/workout', label: 'Workout', end: false, d: 'M3 9v6M6 6v12M18 6v12M21 9v6M6 12h12' },
  { to: '/activity', label: 'Activity', end: false, d: 'M3 12h4l3-8 4 16 3-8h4' },
  { to: '/settings', label: 'Settings', end: false, d: 'M4 6h16M4 12h16M4 18h16' },
];

export function Layout({ title, actions, children }: LayoutProps) {
  return (
    <div className="layout">
      <header className="layout__header">
        <h1 className="layout__title">{title}</h1>
        {actions}
      </header>
      <main className="layout__main">{children}</main>
      <nav className="layout__nav" aria-label="Main">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="layout__link">
            {icon(n.d)}
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
