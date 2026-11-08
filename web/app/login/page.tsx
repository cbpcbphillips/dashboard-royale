import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in · The Gilded Ace" };

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="eyebrow">Staff only · judges welcome</div>
        <h1 className="title login-title">Sign in to the floor review</h1>
        <p className="sub">This dashboard holds machine-level earnings and player results, so it&apos;s limited to Gilded Ace staff.</p>
        <Suspense fallback={<div className="skeleton" style={{ minHeight: 220 }} aria-busy="true" />}>
          <Form searchParams={props.searchParams} />
        </Suspense>
        <p className="login-sso">
          In production this would use the casino&apos;s existing staff sign-in (single sign-on through Microsoft Entra ID, Okta or Google Workspace), so
          access follows HR and is removed the day someone leaves.
        </p>
      </div>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const raw = (await searchParams).next;
  const next = typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  return <LoginForm next={next} />;
}
