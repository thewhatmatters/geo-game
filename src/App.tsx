import { useState } from "react";
import { CountryOutline } from "./components/CountryOutline";
import { getDailyCountry } from "./lib/game/dailyCountry";

const daily = getDailyCountry(new Date());

function App() {
  const [completion, setCompletion] = useState(40);

  return (
    <div className="app">
      <h1>Geo</h1>
      <p>Daily geography outline quiz — coming soon.</p>
      <div className="outline-demo">
        <CountryOutline
          path={daily.target.path}
          completion={completion}
          className="outline-demo__svg"
        />
        <label htmlFor="completion-slider">
          Outline completion: {completion}%
        </label>
        <input
          id="completion-slider"
          type="range"
          min={0}
          max={100}
          value={completion}
          onChange={(event) => setCompletion(Number(event.target.value))}
        />
      </div>
    </div>
  );
}

export default App;
