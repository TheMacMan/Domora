// Markiert Inhalte als personenbezogene Daten. Wird im Privacy-Modus geblurrt.
// Hover/Tap entfernt den Blur kurzzeitig (siehe globals.css).
export function Private({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span data-private="true" className={className}>
      {children}
    </span>
  );
}
