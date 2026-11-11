import { useEffect, useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Loader } from '@mantine/core'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import { Dialog, Tabs } from '@/mantine/page'
import { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import { useToast } from '@/hooks/use-toast'
import { CheckCircle2, XCircle, Sparkles } from 'lucide-react'
import type { SuggestedQualityCheck, DataContract } from '@/types/data-contract'
import CreateVersionDialog from '@/components/data-products/create-version-dialog'
import classes from './dqx-suggestions-dialog.module.css'

interface DqxSuggestionsDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  contractId: string
  contract: DataContract | null
  profileRunId: string
  onSuccess: () => void
}

export default function DqxSuggestionsDialog({
  isOpen,
  onOpenChange,
  contractId,
  contract,
  profileRunId,
  onSuccess
}: DqxSuggestionsDialogProps) {
  const { t } = useTranslation(['data-contracts', 'common'])
  const { toast } = useToast()
  const [suggestions, setSuggestions] = useState<SuggestedQualityCheck[]>([])
  const [loading, setLoading] = useState(false)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [isVersionDialogOpen, setIsVersionDialogOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<'accept' | 'reject' | null>(null)

  // Compute selected IDs from row selection state
  const selectedIds = useMemo(() => {
    return new Set(Object.keys(rowSelection).filter(id => rowSelection[id]))
  }, [rowSelection])

  // Group suggestions by schema
  const suggestionsBySchema = useMemo(() => {
    const grouped: Record<string, SuggestedQualityCheck[]> = {}
    suggestions.filter(s => s.status === 'pending').forEach(suggestion => {
      if (!grouped[suggestion.schema_name]) {
        grouped[suggestion.schema_name] = []
      }
      grouped[suggestion.schema_name].push(suggestion)
    })
    return grouped
  }, [suggestions])

  const schemaNames = Object.keys(suggestionsBySchema)
  const pendingCount = suggestions.filter(s => s.status === 'pending').length

  useEffect(() => {
    if (isOpen && profileRunId) {
      fetchSuggestions()
    }
  }, [isOpen, profileRunId])

  const fetchSuggestions = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/data-contracts/${contractId}/profile-runs/${profileRunId}/suggestions`)
      if (!res.ok) throw new Error('Failed to fetch suggestions')
      const data = await res.json()
      setSuggestions(Array.isArray(data) ? data : [])
    } catch (e) {
      toast({ title: t('common:toast.error'), description: e instanceof Error ? e.message : t('data-contracts:dqx.loadError', 'Failed to load suggestions'), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleSelectAll = useCallback(() => {
    // Select/deselect all pending suggestions
    const pendingIds = suggestions.filter(s => s.status === 'pending').map(s => s.id)
    const allSelected = pendingIds.length > 0 && pendingIds.every(id => rowSelection[id])

    if (allSelected) {
      setRowSelection({})
    } else {
      const newSelection: RowSelectionState = {}
      pendingIds.forEach(id => { newSelection[id] = true })
      setRowSelection(newSelection)
    }
  }, [suggestions, rowSelection])

  const handleAccept = () => {
    if (selectedIds.size === 0) return

    // Check if version bump is needed
    const needsVersionBump = contract && !['draft'].includes((contract.status || '').toLowerCase())

    if (needsVersionBump) {
      setPendingAction('accept')
      setIsVersionDialogOpen(true)
    } else {
      acceptSuggestions()
    }
  }

  const acceptSuggestions = async (newVersion?: string) => {
    try {
      const payload: any = {
        suggestion_ids: Array.from(selectedIds)
      }

      if (newVersion) {
        payload.bump_version = { new_version: newVersion }
      }

      const res = await fetch(`/api/data-contracts/${contractId}/suggestions/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) throw new Error('Failed to accept suggestions')

      const data = await res.json()
      toast({
        title: t('common:toast.success'),
        description: t('data-contracts:dqx.acceptedCount', { count: data.accepted_count, defaultValue: 'Accepted {{count}} quality check suggestions' })
      })

      setRowSelection({})
      onSuccess()
      onOpenChange(false)
    } catch (e) {
      toast({ title: t('common:toast.error'), description: e instanceof Error ? e.message : t('data-contracts:dqx.acceptError', 'Failed to accept suggestions'), variant: 'destructive' })
    }
  }

  const handleReject = async () => {
    if (selectedIds.size === 0) return

    if (!confirm(t('data-contracts:dqx.rejectConfirm', { count: selectedIds.size, defaultValue: 'Reject {{count}} suggestions?' }))) return

    try {
      const res = await fetch(`/api/data-contracts/${contractId}/suggestions/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestion_ids: Array.from(selectedIds) })
      })

      if (!res.ok) throw new Error('Failed to reject suggestions')

      const data = await res.json()
      toast({ title: t('data-contracts:dqx.rejected', 'Rejected'), description: t('data-contracts:dqx.rejectedCount', { count: data.rejected_count, defaultValue: 'Rejected {{count}} suggestions' }) })

      setRowSelection({})
      fetchSuggestions()
    } catch (e) {
      toast({ title: t('common:toast.error'), description: e instanceof Error ? e.message : t('data-contracts:dqx.rejectError', 'Failed to reject suggestions'), variant: 'destructive' })
    }
  }

  const submitNewVersion = async (newVersionString: string) => {
    if (pendingAction === 'accept') {
      await acceptSuggestions(newVersionString)
    }
    setPendingAction(null)
  }

  // Memoised, so the table keeps its cells (and their focus) across renders
  const columns = useMemo<ColumnDef<SuggestedQualityCheck>[]>(() => [
    {
      accessorKey: 'property_name',
      header: t('data-contracts:dqx.columns.column', 'Column'),
      cell: ({ row }) => (
        row.original.property_name
          ? <span className={classes.code}>{row.original.property_name}</span>
          : <span className={classes.tableLevel}>{t('data-contracts:dqx.tableLevel', 'Table-level')}</span>
      )
    },
    {
      accessorKey: 'name',
      header: t('data-contracts:dqx.columns.ruleType', 'Rule Type'),
      cell: ({ row }) => (
        <span>{row.original.name || t('common:states.notAvailable')}</span>
      )
    },
    {
      accessorKey: 'dimension',
      header: t('data-contracts:dqx.columns.dimension', 'Dimension'),
      cell: ({ row }) => (
        row.original.dimension ? (
          <Badge variant="outline">
            {row.original.dimension}
          </Badge>
        ) : null
      )
    },
    {
      accessorKey: 'severity',
      header: t('data-contracts:dqx.columns.severity', 'Severity'),
      cell: ({ row }) => {
        const severity = row.original.severity
        const variant = severity === 'error' ? 'destructive' : severity === 'warning' ? 'default' : 'secondary'
        return severity ? (
          <Badge variant={variant}>
            {severity}
          </Badge>
        ) : null
      }
    },
    {
      accessorKey: 'rule',
      header: t('data-contracts:dqx.columns.rule', 'Rule'),
      cell: ({ row }) => {
        const rule = row.original.rule || row.original.description || '-'
        // Truncated, with the whole rule in its title
        return <span className={classes.rule} title={rule}>{rule}</span>
      }
    }
  ], [t])

  return (
    <>
      <Dialog
        opened={isOpen}
        onClose={() => onOpenChange(false)}
        size="xl"
        title={
          <span className={classes.title}>
            <Sparkles size={16} className={classes.sparkles} aria-hidden />
            {t('data-contracts:dqx.reviewTitle', 'Review Quality Check Suggestions')}
          </span>
        }
        description={t('data-contracts:dqx.reviewDescription', 'Review and accept DQX-generated quality check suggestions for your contract')}
        footer={
          <div className={classes.footer}>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common:actions.close')}
            </Button>
            <div className={classes.footerActions}>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={selectedIds.size === 0 || loading}
              >
                <XCircle aria-hidden />
                {t('data-contracts:dqx.rejectSelected', 'Reject Selected')}
              </Button>
              <Button
                onClick={handleAccept}
                disabled={selectedIds.size === 0 || loading}
              >
                <CheckCircle2 aria-hidden />
                {t('data-contracts:dqx.acceptSelected', 'Accept Selected')}
              </Button>
            </div>
          </div>
        }
      >
        {loading ? (
          <div className={classes.loading}>
            <Loader size={28} />
          </div>
        ) : pendingCount === 0 ? (
          <Alert color="gray" variant="light" icon={<CheckCircle2 size={16} />}>
            {t('data-contracts:dqx.noPending', 'No pending suggestions. All suggestions have been reviewed.')}
          </Alert>
        ) : (
          <>
            <div className={classes.bar}>
              <div className={classes.counts}>
                <span className={classes.strong}>
                  {t('data-contracts:dqx.pendingCount', { count: pendingCount, defaultValue: '{{count}} pending suggestions' })}
                </span>
                <span className={classes.muted}>
                  {t('data-contracts:dqx.selectedCount', { count: selectedIds.size, defaultValue: '{{count}} selected' })}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleSelectAll()}>
                {selectedIds.size === pendingCount ? t('data-contracts:dqx.deselectAll', 'Deselect All') : t('data-contracts:dqx.selectAll', 'Select All')}
              </Button>
            </div>

            {schemaNames.length === 1 ? (
              // Single schema - simple view
              <section className={classes.schema}>
                <h3 className={classes.schemaName}>{schemaNames[0]}</h3>
                <DataTable
                  columns={columns}
                  data={suggestionsBySchema[schemaNames[0]]}
                  rowSelection={rowSelection}
                  onRowSelectionChange={setRowSelection}
                />
              </section>
            ) : (
              // Multiple schemas - use tabs
              <Tabs defaultValue={schemaNames[0]} classNames={{ list: classes.tabList, tab: classes.tab }}>
                <Tabs.List>
                  {schemaNames.map(schemaName => (
                    <Tabs.Tab key={schemaName} value={schemaName}>
                      {schemaName}
                      <Badge variant="secondary">
                        {suggestionsBySchema[schemaName].length}
                      </Badge>
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
                {schemaNames.map(schemaName => (
                  <Tabs.Panel key={schemaName} value={schemaName}>
                    <DataTable
                      columns={columns}
                      data={suggestionsBySchema[schemaName]}
                      rowSelection={rowSelection}
                      onRowSelectionChange={setRowSelection}
                    />
                  </Tabs.Panel>
                ))}
              </Tabs>
            )}
          </>
        )}
      </Dialog>

      {contract && (
        <CreateVersionDialog
          isOpen={isVersionDialogOpen}
          onOpenChange={setIsVersionDialogOpen}
          currentVersion={contract.version}
          productTitle={contract.name}
          onSubmit={submitNewVersion}
        />
      )}
    </>
  )
}
