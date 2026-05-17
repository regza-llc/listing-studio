import { cn } from "@/lib/utils";

/**
 * 子要素の縁を光が周回する装飾。親要素は relative + 適切な border-radius を持つ必要がある。
 */
export function BorderBeam({ className }: { className?: string }) {
  return <span className={cn("border-beam", className)} aria-hidden />;
}
