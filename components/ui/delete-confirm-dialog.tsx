'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

interface DeleteConfirmDialogProps {
  entityLabel: string;          // e.g. "artifact", "campaign", "session", "content piece"
  warningExtra?: string;        // e.g. "Attached artifacts will survive with their session link removed."
  onConfirm: () => void | Promise<void>;
  trigger?: React.ReactNode;    // custom trigger; defaults to a destructive Button labeled "Delete"
  disabled?: boolean;
}

export function DeleteConfirmDialog({
  entityLabel,
  warningExtra,
  onConfirm,
  trigger,
  disabled,
}: DeleteConfirmDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {trigger ?? (
          <Button variant="destructive" size="sm" disabled={disabled}>
            Delete
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {entityLabel} permanently?</AlertDialogTitle>
          <AlertDialogDescription>
            This cannot be undone.{warningExtra ? ' ' + warningExtra : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void onConfirm();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
