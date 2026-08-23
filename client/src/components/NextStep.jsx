import { Link } from 'react-router-dom';

/**
 * "You are here, and here is where you go next."
 *
 * Every screen in this app is a step in a longer errand — book, pay, wait for
 * routing, board, travel — but each one used to end wherever its content ran
 * out. A student who had just paid was left looking at a receipt with no idea
 * that their bus does not exist yet; staff who had ticked off the last name on
 * a boarding list were left on a page that simply said everyone was aboard.
 * Nothing was broken, but the journey read as a set of disconnected pages
 * rather than one process, and people asked "what now?" out loud.
 *
 * So the answer is stated on the page, in the same shape every time: a short
 * sentence about what happens next, and a link that goes there. The arrow is
 * part of the affordance — a forward step should look like one.
 *
 * `actions` is ordered: the first is the step we expect, the rest are the
 * detours (book another, go back). Rendering them differently means the
 * expected path is obvious without reading.
 */
export default function NextStep({ title = 'What happens next', children, actions = [] }) {
  const [primary, ...rest] = actions.filter(Boolean);

  return (
    <div className="card p-5 mt-6">
      <p className="text-xs font-semibold tracking-wide uppercase text-slate-400">
        {title}
      </p>
      {children && <div className="text-sm text-slate-600 mt-1.5">{children}</div>}

      {(primary || rest.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4">
          {primary && <Action {...primary} primary />}
          {rest.map((action) => (
            <Action key={action.label} {...action} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * External links get a real <a>: the driver page is opened on a different
 * device as often as in the same tab, and a react-router <Link> to an absolute
 * URL silently does the wrong thing.
 */
function Action({ to, href, label, primary }) {
  const className = primary
    ? 'btn-primary'
    : 'text-sm text-slate-500 hover:text-brand transition';
  const text = primary ? `${label} →` : label;

  if (href)
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {text}
      </a>
    );

  return (
    <Link to={to} className={className}>
      {text}
    </Link>
  );
}
