import { identity } from '@/lib/auth';
import { AdminDashboard } from '@/components/admin-dashboard';
import Link from 'next/link';
export const dynamic='force-dynamic';
export const metadata={title:'Rev3 Studio | Admin',robots:{index:false,follow:false}};
export default async function Page(){
 const user=await identity().catch(()=>null);
 if(!user?.admin)return <main style={{padding:48}}><h1>Owner access only</h1><p>Sign in with your approved owner account to view Studio activity.</p><Link href="/studio">Go to sign-in</Link></main>;
 return <AdminDashboard/>;
}
