import { redirect } from 'next/navigation';

// Without the landing module the site has no public home page: send people to where the work is.
// (The landing module replaces this file.)
export default function Home() {
  redirect('__LOGIN_REDIRECT__');
}
