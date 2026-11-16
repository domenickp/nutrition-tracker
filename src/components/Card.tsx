import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
}

export function Card({ title, children, className, ...rest }: CardProps) {
  return (
    <section className={`card ${className ?? ''}`.trim()} {...rest}>
      {title && <h2 className="card__title">{title}</h2>}
      {children}
    </section>
  );
}
