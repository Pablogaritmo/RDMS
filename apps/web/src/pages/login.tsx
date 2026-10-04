import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { useLogin, useMe } from '@/lib/queries';
import { Rocket } from 'lucide-react';
import * as React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';

export function LoginPage() {
  const me = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  if (me.data) return <Navigate to={from} replace />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ email: email.trim(), password }, { onSuccess: () => navigate(from, { replace: true }) });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--color-accent),_transparent_60%)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow">
            <Rocket className="size-6" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">RDMS</h1>
          <p className="text-xs text-muted-foreground">Rocket Development Management System · CRATER / GIA / UCR</p>
        </div>
        <form onSubmit={submit} className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="grid gap-3">
            <Field label="Correo">
              <Input type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@crater.ucr.ac.cr" required />
            </Field>
            <Field label="Contraseña">
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {login.error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{login.error.message}</p> : null}
            <Button type="submit" className="mt-1 w-full" loading={login.isPending}>
              Iniciar sesión
            </Button>
          </div>
        </form>
        <p className="mt-4 text-center text-[11px] text-muted-foreground">¿Sin cuenta? Pide a un administrador del club que te cree una.</p>
      </div>
    </div>
  );
}
