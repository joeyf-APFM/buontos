/** Helix's one icon, everywhere it appears (lucide's Dna). It takes the text colour. */
import { Dna } from 'lucide-react';

export function HelixMark({ size = 14, className }: { size?: number; className?: string }) {
  return <Dna size={size} strokeWidth={1.8} className={className} data-helix-icon="dna" aria-hidden />;
}
