import { CreditTiles } from './CreditTiles';
import './band.css';

/* "What your credits buy": the colour tiles on a dark band, on the pricing page. */
export function CreditBuys() {
  return (
    <section className="section" style={{ paddingTop: 0 }} aria-labelledby="buys-title">
      <div className="lp-dr">
        <div className="wrap lp-buy">
          <div className="section-head">
            <div>
              <span className="kicker">What your credits buy</span>
              <h2 className="h2" id="buys-title">
                One balance, <em className="h2-em">every tool.</em>
              </h2>
            </div>
            <p>You see what an action will cost right before it runs, and pay what it really used.</p>
          </div>
          <CreditTiles />
        </div>
      </div>
    </section>
  );
}
