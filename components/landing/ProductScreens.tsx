import { Icon } from '@/components/Icon';

/* Six small, static pictures of the app for the landing page's product tour.
   They only show what each tool really does (see the matching code in
   components/chat, components/papers, components/reader, components/shelf
   and components/studio); none of them is interactive. */

export function AssistantScreen() {
  return (
    <div className="lp-sc lp-sc-chat">
      <div className="lp-q">Is intermittent fasting better than calorie counting for weight loss?</div>
      <div className="lp-steps">
        <span className="lp-step"><Icon name="check" /> Searched papers · 15 found</span>
        <span className="lp-step"><Icon name="check" /> Searched the web · 5 pages</span>
      </div>
      <div className="lp-answer">
        <p>
          Not clearly. In randomised trials, <mark>time-restricted eating produced weight loss similar to daily calorie restriction</mark>
          <span className="lp-cite is-hot">1</span>, and a 12-week trial found no significant difference from eating at any time of day<span className="lp-cite">2</span>.
        </p>
      </div>
      <div className="lp-srcs">
        <div className="lp-src"><b>1 · NEJM · 2022</b><span>Calorie restriction with or without time-restricted eating in weight loss</span></div>
        <div className="lp-src"><b>2 · JAMA Intern Med · 2020</b><span>Effects of time-restricted eating on weight loss and other metabolic parameters</span></div>
      </div>
    </div>
  );
}

export function DeepResearchScreen() {
  return (
    <div className="lp-sc lp-sc-deep">
      <div className="lp-sc-deep-top">
        <div>
          <span className="lp-k">Deep research · running</span>
          <h4>Urban trees and heat-related deaths</h4>
        </div>
        <span className="lp-k">02:10</span>
      </div>
      <div className="lp-prog"><i /></div>
      <ol className="lp-plan">
        <li><span className="lp-dot"><Icon name="check" /></span><span>Planning the research · 4 sub-questions</span><small>0:06</small></li>
        <li><span className="lp-dot"><Icon name="check" /></span><span>Searched papers and the web</span><small>0:52</small></li>
        <li className="is-now"><span className="lp-dot">•</span><span>Reading the best pages</span><small>6 / 8</small></li>
        <li className="is-wait"><span className="lp-dot">4</span><span>Checking what’s missing</span><small /></li>
        <li className="is-wait"><span className="lp-dot">5</span><span>Writing the report</span><small /></li>
      </ol>
    </div>
  );
}

export function PapersScreen() {
  return (
    <div className="lp-sc lp-sc-papers">
      <div className="lp-search"><Icon name="search" />urban heat island mitigation</div>
      <div className="lp-filters">
        <span className="is-on">Since 2015</span>
        <span>Open access</span>
        <span>Environmental science</span>
        <span>Most cited</span>
      </div>
      <div className="lp-res">
        <h5>Urban greening to cool towns and cities</h5>
        <span className="lp-save is-on"><Icon name="bookmark" fill="currentColor" /></span>
        <p>Bowler et al. · Landscape and Urban Planning · 2010</p>
      </div>
      <div className="lp-res">
        <h5>Cooling cities through urban green infrastructure</h5>
        <span className="lp-save"><Icon name="bookmark" /></span>
        <p>Iungman et al. · The Lancet · 2023 · <span className="lp-oa">Open access</span></p>
      </div>
      <div className="lp-res">
        <h5>The energetic basis of the urban heat island</h5>
        <span className="lp-save"><Icon name="bookmark" /></span>
        <p>Oke · Q. J. R. Meteorol. Soc. · 1982</p>
      </div>
    </div>
  );
}

export function ReaderScreen() {
  return (
    <div className="lp-sc lp-sc-reader">
      <div className="lp-page">
        <h6>Urban greening to cool towns and cities: a systematic review</h6>
        <div className="lp-ln" />
        <div className="lp-ln" style={{ width: '92%' }} />
        <div className="lp-ln" style={{ width: '96%' }} />
        <p>
          Meta-analysis suggested that, on average, <mark>a park was around 0.94 °C cooler in the day</mark> than a non-green site.
        </p>
        <div className="lp-ln" />
        <div className="lp-ln" style={{ width: '80%' }} />
        <div className="lp-ln" style={{ width: '94%' }} />
        <div className="lp-ln" style={{ width: '60%' }} />
      </div>
      <div className="lp-ask">
        <span className="lp-k">Ask this paper</span>
        <div className="lp-q">How much cooler were parks?</div>
        <p>
          About 0.94 °C cooler than built-up sites during the day<span className="lp-cite is-hot">1</span>, and larger parks cooled more<span className="lp-cite">2</span>.
        </p>
        <span className="lp-k"><span className="lp-pg">1</span> Page 152 · Results</span>
      </div>
    </div>
  );
}

export function ShelfScreen() {
  return (
    <div className="lp-sc lp-sc-shelf">
      <div className="lp-shelf-nav">
        <span className="lp-k">Shelf</span>
        <span className="is-on">Library <small>128</small></span>
        <span>My uploads <small>14</small></span>
        <span>Thesis · ch. 2 <small>23</small></span>
        <span>Heat &amp; health <small>9</small></span>
      </div>
      <div className="lp-shelf-grid">
        <div className="lp-card"><i style={{ background: 'var(--c-openalex)' }} /><h5>Urban greening to cool towns and cities</h5><p>2010 · PDF</p></div>
        <div className="lp-card"><i style={{ background: 'var(--thread)' }} /><h5>Cooling cities through urban green infrastructure</h5><p>2023 · read</p></div>
        <div className="lp-card"><i style={{ background: 'var(--c-openlibrary)' }} /><h5>The Structure of Scientific Revolutions</h5><p>1962 · book</p></div>
        <div className="lp-card"><i style={{ background: 'var(--c-uploads)' }} /><h5>Field notes, site B.pdf</h5><p>upload · 2.1 MB</p></div>
      </div>
    </div>
  );
}

export function CitationScreen() {
  return (
    <div className="lp-sc lp-sc-cite">
      <div className="lp-draft">
        <mark>Cities are several degrees warmer than the countryside around them</mark> (Oke, 1982), and <mark>urban greening lowers temperatures by about a degree</mark> (Bowler et al., 2010).
      </div>
      <div className="lp-styles">
        <span className="is-on">APA 7</span>
        <span>MLA 9</span>
        <span>Chicago</span>
        <span>Harvard</span>
        <span>IEEE</span>
        <span>+7</span>
      </div>
      <div className="lp-entry">
        Bowler, D. E., Buyung-Ali, L., Knight, T. M., &amp; Pullin, A. S. (2010). Urban greening to cool towns and cities. <i>Landscape and Urban Planning, 97</i>(3), 147–155.
      </div>
    </div>
  );
}
