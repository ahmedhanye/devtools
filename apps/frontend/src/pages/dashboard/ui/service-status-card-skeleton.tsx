import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@/shared/ui";

export interface ServiceStatusCardSkeletonProps {
  name?: string;
}

export function ServiceStatusCardSkeleton({
  name = "DevTools API Service",
}: ServiceStatusCardSkeletonProps) {
  return (
    <Card className="flex flex-col justify-between">
      <CardHeader>
        <CardTitle>{name}</CardTitle>
        <CardDescription>
          <Skeleton className="h-4 w-24" />
        </CardDescription>
        <CardAction>
          <Skeleton className="h-5 w-20" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="text-muted-foreground flex items-center gap-1.5">
            <Skeleton className="size-3.5" />
            <span>Uptime:</span>
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="text-muted-foreground flex items-center gap-1.5">
            <Skeleton className="size-3.5" />
            <span>Last Checked:</span>
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
