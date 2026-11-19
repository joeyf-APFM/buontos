import { Link } from 'react-router-dom';

interface ContractStatusBreakdownProps {
  /** The list page each status links to; the data products tile passes its own. */
  to?: string;
  statusCounts: {
    status: string;
    count: number;
  }[];
}

export default function ContractStatusBreakdown({ statusCounts, to = '/data-contracts' }: ContractStatusBreakdownProps) {
  return (
    <div className="flex flex-col gap-0.5 mt-2">
      {statusCounts.map(({ status, count }) => (
        <Link
          key={status}
          to={`${to}?status=${status.toLowerCase()}`}
          className="flex items-center justify-between px-2 py-0.5 rounded hover:bg-accent/50 transition-colors group"
        >
          <span className="text-xs text-muted-foreground capitalize">{status}</span>
          <span className="text-sm font-semibold text-foreground group-hover:underline">
            {count}
          </span>
        </Link>
      ))}
    </div>
  );
}
