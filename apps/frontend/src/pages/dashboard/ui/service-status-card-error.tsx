import { cn } from "@/shared/lib";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/shared/ui";
import { AlertCircle, RefreshCw } from "lucide-react";

export interface ServiceStatusCardErrorProps {
  name?: string;
  error: Error;
  onRefresh?: () => void;
  isRetrying?: boolean;
}

export function ServiceStatusCardError({
  name = "DevTools API Service",
  error,
  onRefresh,
  isRetrying = false,
}: ServiceStatusCardErrorProps) {
  return (
    <Card className="flex flex-col justify-between">
      <CardHeader>
        <CardTitle>{name}</CardTitle>
        <CardDescription>Runtime Daemon</CardDescription>
        <CardAction>
          <Badge variant="destructive">
            <AlertCircle className="size-3.5" />
            Unreachable
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="bg-destructive/10 text-destructive rounded-md p-3 text-xs">
          <p className="font-semibold">Service Unreachable</p>
          <p className="mt-1 font-mono break-all">{error.message}</p>
        </div>
      </CardContent>
      {onRefresh && (
        <CardFooter>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onRefresh}
            disabled={isRetrying}
          >
            <RefreshCw
              className={cn("me-1.5 size-3", isRetrying && "animate-spin")}
            />
            Retry Connection
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
