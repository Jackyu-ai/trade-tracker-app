import React, { useState } from 'react';
import ConsolidatedLeagueTracker from './components/ConsolidatedLeagueTracker';

const App: React.FC = () => {
  const [leagueId, setLeagueId] = useState<string>('');
  const [submittedLeagueId, setSubmittedLeagueId] = useState<string | null>(null);
  const [is3rdRoundReversal, setIs3rdRoundReversal] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmittedLeagueId(leagueId);
  };

  return (
    <div className="App p-4">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Dynasty League Trade Tracker</h1>
      </header>
      <main>
        <form onSubmit={handleSubmit} className="mb-6">
          <div className="flex items-center">
            <input
              type="text"
              value={leagueId}
              onChange={(e) => setLeagueId(e.target.value)}
              placeholder="Enter League ID"
              className="border p-2 mr-2 rounded"
            />
            <button type="submit" className="bg-blue-500 text-white p-2 rounded">
              Load League
            </button>
          </div>
        </form>
        <div className="mb-4">
          <input
            type="checkbox"
            id="3rdRoundReversal"
            checked={is3rdRoundReversal}
            onChange={(e) => setIs3rdRoundReversal(e.target.checked)}
          />
          <label htmlFor="3rdRoundReversal" className="ml-2">3rd Round Reversal</label>
        </div>
        {submittedLeagueId ? (
          <ConsolidatedLeagueTracker
            initialLeagueId={submittedLeagueId}
            is3rdRoundReversal={is3rdRoundReversal}
          />
        ) : (
          <p>Please enter a league ID to view trade data.</p>
        )}
      </main>
    </div>
  );
};

export default App;