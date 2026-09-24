import { useEffect, useState } from "react";
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";

export function AgentChatFeature() {
  const [isAgentChatOpen, setIsAgentChatOpen] = useState(false);

  useEffect(() => {
    if (!isAgentChatOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsAgentChatOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isAgentChatOpen]);

  return (
    <>
      <button
        type="button"
        className="fab icon-fab chat-fab"
        onClick={() => setIsAgentChatOpen(true)}
        title="Open Agent Chat"
        aria-label="Open Agent Chat"
      >
        <ChatRoundedIcon fontSize="small" />
      </button>

      {isAgentChatOpen ? (
        <section className="agent-chat-overlay" aria-label="Agent Chat">
          <div className="agent-chat-panel" role="dialog" aria-modal="true" aria-label="Agent Chat window">
            <header className="agent-chat-header">
              <div className="agent-chat-title-wrap">
                <span className="agent-chat-icon-badge" aria-hidden>
                  <ChatRoundedIcon fontSize="small" />
                </span>
                <div>
                  <h2>Agent Chat</h2>
                  <p>Plan, ask, and get help for family coordination.</p>
                </div>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsAgentChatOpen(false)}
                title="Close Agent Chat"
                aria-label="Close Agent Chat"
              >
                <CloseRoundedIcon fontSize="small" />
              </button>
            </header>
            <div className="agent-chat-messages" aria-live="polite">
              <article className="agent-chat-message agent">
                <p>Hi! I’m your Family Butler Agent. I can help draft routines, reminders, and weekly plans.</p>
              </article>
              <article className="agent-chat-message user">
                <p>Create a school-week evening routine for Lena and Max.</p>
              </article>
              <article className="agent-chat-message agent">
                <p>
                  Great idea. I can draft a weekday plan with dinner, prep for tomorrow, and bedtime. Start by choosing the days
                  you want covered.
                </p>
              </article>
            </div>
            <form className="agent-chat-composer" onSubmit={(event) => event.preventDefault()}>
              <input type="text" placeholder="Message Family Butler Agent…" aria-label="Message Agent Chat" />
              <button type="submit" className="icon-button" aria-label="Send message" title="Send message">
                <SendRoundedIcon fontSize="small" />
              </button>
            </form>
          </div>
        </section>
      ) : null}
    </>
  );
}
