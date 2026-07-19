import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

const ROLES = [
  { v: "admin", l: "Administrator" },
  { v: "client", l: "Client (Retail)" },
  { v: "reseller", l: "Reseller (Wholesale)" },
];

export default function Users() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);

  const load = () => api.get("/users").then((r) => setUsers(r.data));
  useEffect(() => { load(); }, []);

  const changeRole = async (id, role) => {
    try { await api.put(`/users/${id}/role`, { role }); toast.success("Role updated"); load(); }
    catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };
  const remove = async (id) => {
    try { await api.delete(`/users/${id}`); toast.success("User deleted"); load(); }
    catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  return (
    <div data-testid="users-page">
      <PageHeader title="Users" subtitle="Assign roles: Administrator, Client (retail) or Reseller (wholesale)" />
      <div className="p-8">
        <div className="border border-slate-200 rounded-sm overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-2.5 text-xs font-mono uppercase tracking-widest text-slate-500">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-mono uppercase tracking-widest text-slate-500">Email</th>
                <th className="text-left px-4 py-2.5 text-xs font-mono uppercase tracking-widest text-slate-500">Role</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} data-testid="user-row" className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium">{u.name}</td>
                  <td className="px-4 py-2.5 text-slate-600">{u.email}</td>
                  <td className="px-4 py-2.5">
                    {u.id === user.id ? (
                      <Badge className="bg-[#2495D3] rounded-sm">You (Admin)</Badge>
                    ) : (
                      <Select value={u.role} onValueChange={(v) => changeRole(u.id, v)}>
                        <SelectTrigger data-testid={`role-select-${u.email}`} className="rounded-sm w-52 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>{ROLES.map((r) => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {u.id !== user.id && (
                      <button data-testid="delete-user" onClick={() => remove(u.id)} className="p-1.5 text-slate-400 hover:text-red-500"><Trash2 size={15} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
