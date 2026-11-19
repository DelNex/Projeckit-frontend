import { notFound } from 'next/navigation';
import { OcrValidationClient } from './validation-client';

/** Development-only browser integration page; never exposed in production. */
export default function OcrValidationPage() {
  if (process.env.NODE_ENV !== 'development' && !(process.env.OMR_VALIDATION_ENABLED === 'true' && process.env.GITHUB_ACTIONS === 'true')) notFound();
  return <OcrValidationClient />;
}
