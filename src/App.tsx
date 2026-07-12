import { Keyboard } from "./components/Keyboard";
import { CountryOutline } from "./components/CountryOutline";
import { getDailyCountry } from "./lib/game/dailyCountry";
import { useGameRound } from "./lib/game/useGameRound";

const daily = getDailyCountry(new Date());

function App() {
  const round = useGameRound(daily.target);

  return (
    <div className="app">
      <h1>Geo</h1>
      <p className="clock" data-testid="clock">
        {Math.ceil(round.remainingSeconds)}s
      </p>
      <div className="outline-demo">
        <CountryOutline
          path={daily.target.path}
          completion={round.outlineCompletion}
          className="outline-demo__svg"
        />
      </div>
      <p className="display-name" data-testid="display-name">
        {round.displayName}
      </p>
      {round.status !== "running" && (
        <p className="round-outcome" data-testid="round-outcome">
          {round.status === "solved" ? "Solved!" : "Failed"}
        </p>
      )}
      <Keyboard
        guesses={round.guesses}
        onGuess={round.guessLetter}
        disabled={round.status !== "running"}
      />
      <button
        type="button"
        className="give-up"
        onClick={round.giveUp}
        disabled={round.status !== "running"}
      >
        Give up
      </button>
    </div>
  );
}

export default App;
