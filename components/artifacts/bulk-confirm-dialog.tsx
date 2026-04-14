'use client';
// 'use client' — Dialog open/close is controlled state; onConfirm/onClose are event handlers

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface SkippedItem {
  id: string;
  reason: string;
}

interface BulkConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  actionLabel: string;
  totalSelected: number;
  skipped: SkippedItem[];
  loading: boolean;
}

export function BulkConfirmDialog({
  open,
  onClose,
  onConfirm,
  actionLabel,
  totalSelected,
  skipped,
  loading,
}: BulkConfirmDialogProps) {
  // totalSelected is already the actionable count (skipped items excluded by caller)
  const affectedCount = totalSelected;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{actionLabel}</DialogTitle>
          <DialogDescription>
            {affectedCount === 0
              ? 'No artifacts can be updated with this action.'
              : `${affectedCount} artifact${affectedCount !== 1 ? 's' : ''} will be updated.`}
          </DialogDescription>
        </DialogHeader>

        {skipped.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 p-3 text-sm max-h-48 overflow-y-auto">
            <p className="font-medium text-amber-800 dark:text-amber-200 mb-1.5">
              {skipped.length} artifact{skipped.length !== 1 ? 's' : ''} will be skipped:
            </p>
            <ul className="space-y-1 text-amber-700 dark:text-amber-300">
              {skipped.map((item) => (
                <li key={item.id} className="text-xs truncate">
                  {item.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading || affectedCount === 0}
          >
            {loading
              ? 'Applying…'
              : `Apply to ${affectedCount} artifact${affectedCount !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
