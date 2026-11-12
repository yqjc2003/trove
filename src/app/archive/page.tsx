import { redirect } from 'next/navigation';
export default function ArchivePage() {
  redirect('/items?status=archived');
}
