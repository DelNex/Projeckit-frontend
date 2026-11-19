import { notFound } from 'next/navigation';
import { OmrBrowserValidation } from './validation-client';

/**
 * Private test harness route. It is available in development and in the
 * explicitly opted-in browser-validation build only.
 */
export default function OmrValidationPage() {
  const validationEnabled = process.env.NODE_ENV === 'development'
    || process.env.OMR_BROWSER_VALIDATION === 'true';
  if (!validationEnabled) notFound();
  return <OmrBrowserValidation />;
}
