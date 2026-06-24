import { Component, type ReactNode } from "react";

// Catches any render crash (e.g. a STALE `me` cache from an older deploy missing a field that a
// child now reads → would white-screen the whole app). On the first crash we wipe every cached
// payload + reload ONCE (sessionStorage guard prevents an infinite loop); the fresh fetch returns
// the current shape, so the user self-heals instead of staring at a blank screen.
interface State {
  crashed: boolean;
}
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(): void {
    const KEY = "boot_recover";
    let recovered = false;
    try {
      recovered = sessionStorage.getItem(KEY) === "1";
    } catch {
      /* ignore */
    }
    if (!recovered) {
      // first crash → clear any stale cache + reload once for a fresh, current-shape payload
      try {
        sessionStorage.setItem(KEY, "1");
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith("me_v")) localStorage.removeItem(k);
        }
      } catch {
        /* ignore */
      }
      location.reload();
    }
  }

  render(): ReactNode {
    if (this.state.crashed) {
      // second crash (real bug, not stale cache) → a calm screen instead of a blank page
      return (
        <div className="screen center">
          <div className="aurora" />
          <div className="nl-card glass pad tac">
            <div className="boot-stage" style={{ margin: "4px auto 14px" }}>
              <div className="boot-rings"><span /><span /><span /></div>
              <div className="boot-badge">🚕</div>
            </div>
            <h2>Bir muammo chiqdi</h2>
            <p className="muted">Iltimos, qayta urinib ko'ring.</p>
            <button className="d-btn mt12" onClick={() => location.reload()}>🔄 Qayta yuklash</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
