interface StatusMessageProps {
  type: "info" | "success" | "error";
  message: string;
}

export function StatusMessage({ type, message }: StatusMessageProps) {
  const colorClass =
    type === "error"
      ? "text-destructive"
      : type === "success"
      ? "text-green-600 dark:text-green-400"
      : "text-muted-foreground";

  return <p className={`text-sm ${colorClass}`}>{message}</p>;
}
