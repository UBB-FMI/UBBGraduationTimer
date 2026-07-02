import React, { Component } from 'react';
import clsx from 'clsx';
import './App.css';

const STAGE = {
  PRESENTATION: 'presentation',
  QUESTIONS: 'questions',
};

const PRESENTATION_SECONDS = 15 * 60;
const QUESTION_SECONDS = 5 * 60;
const TICK_SECONDS = 0.5;

const pad = (n) => (n < 10) ? `0${n}` : `${n}`;

const getDisplaySeconds = (t) => Math.ceil(Math.abs(t));

const getTimeParts = (t) => {
  const safeTime = Math.max(0, Math.ceil(t));
  return {
    minute: Math.floor(safeTime / 60),
    second: safeTime % 60,
  };
};

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      t: PRESENTATION_SECONDS,
      paused: true,
      stage: STAGE.PRESENTATION,
      fullscreen: false,
      editing: null, // minute, second, null
      showCursor: false,
      carryoverEnabled: true,
      carryover: 0,
      overtimeAlarmed: false,
    };
    this.timer = null;
    this.wakeLock = null;
    this.alarmAudio = typeof window !== 'undefined' && window.Audio
      ? new window.Audio(`${process.env.PUBLIC_URL || ''}/alarm.mp3`)
      : null;
    if (this.alarmAudio) {
      this.alarmAudio.preload = 'auto';
    }
  }

  componentDidMount() {
    this.timer = setInterval(() => {
      this.tick();
    }, 500);
    window.addEventListener('keydown', this.handleKeyDown);
  }

  componentWillUnmount() {
    clearInterval(this.timer);
    window.removeEventListener('keydown', this.handleKeyDown);
    this.releaseWakeLock();
  }

  async requestWakeLock() {
    try {
      if (this.wakeLock) return;
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
          console.log('Wake Lock was released');
        });
        console.log('Wake Lock is active');
      }
    } catch (err) {
      console.error(`${err.name}, ${err.message}`);
    }
  }

  async releaseWakeLock() {
    if (this.wakeLock) {
      await this.wakeLock.release();
      this.wakeLock = null;
    }
  }

  playAlarm() {
    if (!this.alarmAudio) return;
    this.alarmAudio.currentTime = 0;
    const playPromise = this.alarmAudio.play();
    if (playPromise && playPromise.catch) {
      playPromise.catch(() => {});
    }
  }

  stopAlarm() {
    if (!this.alarmAudio) return;
    this.alarmAudio.pause();
    this.alarmAudio.currentTime = 0;
  }

  tick() {
    const { paused, showCursor, editing } = this.state;
    let shouldPlayAlarm = false;
    if (editing) {
      this.setState({ showCursor: !showCursor });
    }
    if (paused) return;
    this.setState((prevState) => {
      if (prevState.paused) return null;

      if (prevState.stage === STAGE.QUESTIONS && prevState.carryover > 0) {
        return {
          carryover: Math.max(0, prevState.carryover - TICK_SECONDS),
        };
      }

      const t = prevState.t - TICK_SECONDS;
      const enteredOvertime = !prevState.overtimeAlarmed
        && ((prevState.t > 0 && t <= 0) || (prevState.t === 0 && t < 0));
      shouldPlayAlarm = enteredOvertime;

      return {
        t,
        overtimeAlarmed: prevState.overtimeAlarmed || enteredOvertime,
      };
    }, () => {
      if (shouldPlayAlarm) {
        this.playAlarm();
      }
    });
  }

  toggleFullScreen = () => {
    const { fullscreen } = this.state;
    if (!fullscreen) {
      document.documentElement.requestFullscreen();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
    this.setState({ fullscreen: !fullscreen });
  };

  resetTimer = () => {
    this.stopAlarm();
    this.releaseWakeLock();
    this.setState({
      t: PRESENTATION_SECONDS,
      paused: true,
      stage: STAGE.PRESENTATION,
      editing: null,
      showCursor: false,
      carryover: 0,
      overtimeAlarmed: false,
    });
  };

  continueToQuestions = (startRunning) => {
    if (this.state.stage !== STAGE.PRESENTATION) return;

    const shouldRun = typeof startRunning === 'boolean'
      ? startRunning
      : !this.state.paused;
    const carryover = this.state.carryoverEnabled && this.state.t > 0
      ? Math.ceil(this.state.t)
      : 0;

    this.stopAlarm();
    this.setState({
      t: QUESTION_SECONDS,
      paused: !shouldRun,
      stage: STAGE.QUESTIONS,
      editing: null,
      showCursor: false,
      carryover,
      overtimeAlarmed: false,
    }, () => {
      if (shouldRun) {
        this.requestWakeLock();
      } else {
        this.releaseWakeLock();
      }
    });
  };

  toggleCarryover = () => {
    this.setState((prevState) => ({
      carryoverEnabled: !prevState.carryoverEnabled,
      carryover: prevState.carryoverEnabled && prevState.stage === STAGE.QUESTIONS
        ? 0
        : prevState.carryover,
    }));
  };

  pauseTimer = () => {
    const paused = !this.state.paused;
    this.setState({
      paused,
      editing: null,
      showCursor: false,
    }, () => {
      if (!paused) {
        this.requestWakeLock();
      } else {
        this.releaseWakeLock();
      }
    });
  };

  toggleEditing = () => {
    const { editing } = this.state;
    this.setState({
      editing: editing ? null : 'second',
    });
  };

  handleCursorMove(direction) {
    const state = { ...this.state };
    state.paused = true;
    this.releaseWakeLock();
    switch (direction) {
      case 'up':
      case 'down':
        if (!state.editing) {
          state.editing = 'second';
        }
        if (state.t < 0) {
          state.t = 0;
        }
        state.t += (direction === 'up' ? 1 : -1) * (state.editing === 'second' ? 1 : 60);
        if (state.t < 0) {
          state.t = 0;
        }
        state.overtimeAlarmed = false;
        break;
      case 'left':
        state.editing = 'minute';
        break;
      case 'right':
        state.editing = 'second';
        break;
      default:
        break;
    }
    this.setState(state);
  }

  handleKeyDown = (event) => {
    switch (event.key) {
      case 'B':
      case 'b':
        this.toggleCarryover();
        break;
      case 'F':
      case 'f':
        this.toggleFullScreen();
        break;
      case 'R':
      case 'r':
        this.resetTimer();
        break;
      case 'V':
      case 'v':
        this.continueToQuestions(false);
        break;
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
        this.handleCursorMove(event.key.toLowerCase().replace('arrow', ''));
        break;
      case 'Enter':
        this.toggleEditing();
        break;
      case ' ':
        if (this.state.stage === STAGE.PRESENTATION && this.state.t <= 0) {
          this.continueToQuestions(true);
        } else {
          this.pauseTimer();
        }
        break;
      default:
        break;
    }
  };

  render() {
    const {
      t,
      paused,
      editing,
      stage,
      showCursor,
      fullscreen,
      carryoverEnabled,
      carryover,
    } = this.state;
    const { minute, second } = getTimeParts(getDisplaySeconds(t));
    const bonus = getTimeParts(carryover);
    const isQuestions = stage === STAGE.QUESTIONS;
    const isOvertime = t <= 0;
    const stageLabel = isQuestions ? 'Question Time' : 'Presentation';
    const spaceAction = stage === STAGE.PRESENTATION && t <= 0
      ? 'continue'
      : (paused ? 'start' : 'pause');

    return (
      <div className="App">
        <div className="timer-panel">
          <div className="stage-label">{stageLabel}</div>
          <div
            className={clsx('clock', {
              'show-cursor': showCursor,
              'question-stage': isQuestions,
              overtime: isOvertime,
            })}
            onDoubleClick={() => this.toggleFullScreen()}
          >
            <span className={clsx('time minute', { editing: editing === 'minute' })}>{pad(minute)}</span>
            :
            <span className={clsx('time second', { editing: editing === 'second' })}>{pad(second)}</span>
          </div>
          {isQuestions && carryover > 0 &&
            <div className="bonus-time">+ {pad(bonus.minute)}:{pad(bonus.second)}</div>
          }
        </div>
        <ul className="tips">
          <li>
            <button onClick={this.toggleFullScreen}>F</button>
            -
            <span className="tip">{fullscreen ? 'exit' : 'enter'} fullscreen</span>
          </li>
          <li>
            <button onClick={() => this.handleCursorMove('left')}>←</button>
            <button onClick={() => this.handleCursorMove('right')}>→</button>
            <button onClick={() => this.handleCursorMove('up')}>↑</button>
            <button onClick={() => this.handleCursorMove('down')}>↓</button>
            -
            <span className="tip">edit timer</span>
          </li>
          <li>
            <button onClick={this.resetTimer}>R</button>
            -
            <span className="tip">reset timer</span>
          </li>
          {stage === STAGE.PRESENTATION &&
            <li>
              <button onClick={() => this.continueToQuestions(false)}>V</button>
              -
              <span className="tip">question time</span>
            </li>
          }
          <li>
            <button onClick={this.toggleCarryover}>B</button>
            -
            <span className="tip">carry presentation time {carryoverEnabled ? 'on' : 'off'}</span>
          </li>
          <li>
            <button onClick={this.pauseTimer}>Space</button>
            -
            <span className="tip">{spaceAction} timer</span>
          </li>
        </ul>
      </div>
    );
  }
}

export default App;
