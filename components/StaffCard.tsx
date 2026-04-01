export default function StaffCard({
  title,
  children,
  variant = "default",
  noStretch = false,
  style,
}: {
  title?: string;
  children: React.ReactNode;
  variant?: "default" | "compact";
  /** Prevent grid/flex parents from stretching the card's height */
  noStretch?: boolean;
  style?: React.CSSProperties;
}) {
  const dense = variant === "compact";

  return (
    <section
      style={{
        background: "white",
        border: "1px solid #E5E7EB",
        borderRadius: 12,
        padding: dense ? 12 : 16,
        // key line: stop the card from stretching to fill the row
        alignSelf: noStretch ? "start" : undefined,
        height: noStretch ? "auto" : undefined,
        ...style,
      }}
    >
      {title ? (
        <h2
          style={{
            margin: 0,
            marginBottom: dense ? 8 : 12,
            fontSize: dense ? 16 : 18,
            lineHeight: 1.2,
          }}
        >
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}