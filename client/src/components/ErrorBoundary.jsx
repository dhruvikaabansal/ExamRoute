import { Component } from 'react';

/**
 * Stops one broken screen from taking down the whole app.
 *
 * React unmounts the entire tree when a render error goes uncaught, so a
 * single failing component produced a completely blank page — no navbar, no
 * message, nothing to act on. That is indistinguishable from a dead server,
 * and it sent us looking in the wrong place: the driver link was fine, the
 * page rendering it was not.
 *
 * In development the error and component stack are shown, because the fastest
 * way to fix a crash is to be told what it was. In production the visitor
 * gets a plain apology instead of a stack trace.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('Render error:', error, info?.componentStack);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="max-w-2xl mx-auto my-8 bg-red-50 border border-red-200 rounded-lg p-5">
        <h2 className="text-lg font-semibold text-red-800">This page failed to load</h2>
        <p className="text-sm text-red-700 mt-1">
          Something went wrong rendering this screen. The rest of the app still works —
          use the menu above to go somewhere else.
        </p>

        {import.meta.env.DEV && (
          <>
            <pre className="mt-3 text-xs bg-white border border-red-200 rounded p-3 overflow-auto text-red-900">
              {String(error?.stack || error)}
            </pre>
            {info?.componentStack && (
              <pre className="mt-2 text-xs bg-white border border-red-200 rounded p-3 overflow-auto text-slate-600">
                {info.componentStack}
              </pre>
            )}
          </>
        )}

        <button
          onClick={() => this.setState({ error: null, info: null })}
          className="mt-4 bg-red-600 text-white text-sm px-4 py-2 rounded hover:bg-red-700"
        >
          Try again
        </button>
      </div>
    );
  }
}
