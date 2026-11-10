import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import useBreadcrumbStore from '@/stores/breadcrumb-store';

export default function NotFound() {
  const { t } = useTranslation(['errors', 'common']);
  // The shell's breadcrumb: Home > Not found
  const setDynamicTitle = useBreadcrumbStore((s) => s.setDynamicTitle);
  useEffect(() => {
    setDynamicTitle(t('common:errors.notFound'));
  }, [setDynamicTitle, t]);
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <h1 className="text-4xl font-bold mb-4">{t('notFound.title')}</h1>
      <p className="text-lg text-muted-foreground mb-8">
        {t('notFound.message')}
      </p>
      <Button asChild>
        <Link to="/">{t('notFound.backHome')}</Link>
      </Button>
    </div>
  );
} 