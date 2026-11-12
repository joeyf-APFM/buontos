import type { ReactNode } from 'react'
import changeCss from './change-analysis.module.css'

export interface ChangeListProps {
  /** The tone of the items' markers. */
  tone: 'critical' | 'info' | 'muted'
  heading: ReactNode
  items: string[]
}

/**
 * A change analysis tab's list of changes, under its heading, each item
 * marked in the tab's tone (change-analysis.module.css). Shared by the
 * versioning recommendation and the contract commit-draft dialogs.
 */
export function ChangeList({ tone, heading, items }: ChangeListProps) {
  return (
    <section className={changeCss.card}>
      <h3 className={changeCss.cardTitle}>{heading}</h3>
      <ul className={changeCss.list} data-tone={tone}>
        {items.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>
    </section>
  )
}
