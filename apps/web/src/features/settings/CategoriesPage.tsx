import { zodResolver } from '@hookform/resolvers/zod';
import { CreateCategorySchema } from '@stockwise/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Pencil, Plus, Tags } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { useBusinessKey, useCan } from '@/app/auth';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Checkbox, Field, Input, Select } from '@/components/ui/Field';
import { Card, EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { FormAlert } from '@/features/auth/AuthLayout';
import { api } from '@/lib/api';
import { useApplyServerErrors, useErrorMessage, useValidationMessage } from '@/lib/errors';
import type { Category } from '@/lib/types';
import { SettingsTabs } from './SettingsTabs';

type Values = z.input<typeof CreateCategorySchema>;

function CategoryDialog({
  open,
  onClose,
  category,
  parents,
}: {
  open: boolean;
  onClose: () => void;
  category?: Category;
  parents: Category[];
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const b = useBusinessKey();
  const v = useValidationMessage();
  const errorMessage = useErrorMessage();
  const applyServerErrors = useApplyServerErrors<Values>();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values, unknown, z.output<typeof CreateCategorySchema>>({
    resolver: zodResolver(CreateCategorySchema),
  });
  useEffect(() => {
    if (open) {
      form.reset({
        name: category?.name ?? '',
        parentId: category?.parentId ?? '',
        description: category?.description ?? '',
      });
      setFormError(null);
    }
  }, [open, category, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await api(category ? `/categories/${category.id}` : '/categories', {
        method: category ? 'PATCH' : 'POST',
        body: values,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: [b, 'categories'] }),
        qc.invalidateQueries({ queryKey: [b, 'products'] }),
      ]);
      onClose();
    } catch (err) {
      if (!applyServerErrors(err, form.setError)) setFormError(errorMessage(err));
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={category ? t('settings:categories.editTitle') : t('settings:categories.createTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" form="category-form" loading={form.formState.isSubmitting}>
            {t('common:actions.save')}
          </Button>
        </>
      }
    >
      <FormAlert message={formError} />
      <form id="category-form" onSubmit={onSubmit} noValidate className="space-y-3">
        <Field label={t('settings:categories.name')} error={v(form.formState.errors.name?.message)}>
          {(p) => <Input {...p} autoFocus {...form.register('name')} />}
        </Field>
        <Field label={t('settings:categories.parent')} hint={t('settings:categories.parentHint')}>
          {(p) => (
            <Select {...p} {...form.register('parentId')}>
              <option value="">{t('common:none')}</option>
              {parents
                .filter((c) => c.id !== category?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field
          label={t('settings:categories.description')}
          error={v(form.formState.errors.description?.message)}
        >
          {(p) => <Input {...p} {...form.register('description')} />}
        </Field>
      </form>
    </Dialog>
  );
}

export function CategoriesPage() {
  const { t } = useTranslation();
  const can = useCan();
  const b = useBusinessKey();
  const qc = useQueryClient();
  const errorMessage = useErrorMessage();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const query = useQuery({
    queryKey: [b, 'categories', 'list', { archived: showArchived }],
    queryFn: () =>
      api<{ data: Category[] }>('/categories', { query: { archived: showArchived || undefined } }),
  });
  const archive = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      api(`/categories/${id}/${archived ? 'archive' : 'restore'}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [b, 'categories'] }),
  });
  const manage = can('categories.manage');
  const topLevel = (query.data?.data ?? []).filter((c) => !c.parentId);

  return (
    <>
      <SettingsTabs />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Checkbox
          label={t('products:filters.archived')}
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
        {manage && (
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            {t('settings:categories.new')}
          </Button>
        )}
      </div>
      {archive.isError && <FormAlert message={errorMessage(archive.error)} />}
      <Card className="max-w-3xl">
        {query.isPending ? (
          <SkeletonRows />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.data.length === 0 ? (
          <EmptyState
            icon={<Tags className="size-6" />}
            title={t('settings:categories.emptyTitle')}
            description={t('settings:categories.emptyText')}
          />
        ) : (
          <ul className="divide-y divide-stone-100">
            {query.data.data.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {c.parent && <span className="text-stone-500">{c.parent.name} › </span>}
                    {c.name}
                  </p>
                  <p className="text-xs text-stone-500">
                    {t('settings:categories.productCount', { count: c.productCount })}
                  </p>
                </div>
                {manage && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Pencil className="size-4" />}
                      onClick={() => setEditing(c)}
                      aria-label={t('common:actions.edit')}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={
                        c.archivedAt ? (
                          <ArchiveRestore className="size-4" />
                        ) : (
                          <Archive className="size-4" />
                        )
                      }
                      onClick={() => archive.mutate({ id: c.id, archived: !c.archivedAt })}
                      aria-label={
                        c.archivedAt ? t('common:actions.restore') : t('common:actions.archive')
                      }
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <CategoryDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        category={editing === 'new' ? undefined : (editing ?? undefined)}
        parents={topLevel}
      />
    </>
  );
}
