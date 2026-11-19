import { notFound } from 'next/navigation';
import { OcrValidationClient } from './validation-client';

/** Development-only browser integration page; never exposed in production. */
export default function OcrValidationPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <OcrValidationClient />;
}
