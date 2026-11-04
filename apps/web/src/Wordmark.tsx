export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <a
      className="wordmark"
      href="https://openstacktool.com/"
      aria-label="OpenStackTools home"
    >
      <span className="wordmark-icon" aria-hidden="true">
        OST
      </span>
      {!compact && (
        <span className="wordmark-name">
          OpenStackTools <strong>AI</strong>
        </span>
      )}
    </a>
  );
}
