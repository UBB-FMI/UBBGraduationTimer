import React from 'react';
import ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import App from './App';

let div;

beforeAll(() => {
  Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: jest.fn(() => Promise.resolve()),
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: jest.fn(),
  });
});

beforeEach(() => {
  div = document.createElement('div');
  document.body.appendChild(div);
});

afterEach(() => {
  ReactDOM.unmountComponentAtNode(div);
  div.remove();
});

const renderApp = () => {
  act(() => {
    ReactDOM.render(<App />, div);
  });
};

it('renders the default presentation countdown', () => {
  renderApp();

  expect(div.querySelector('.stage-label').textContent).toBe('Presentation');
  expect(div.querySelector('.minute').textContent).toBe('15');
  expect(div.querySelector('.second').textContent).toBe('00');
  expect(div.textContent).not.toContain('stopwatch');
});

it('carries unused presentation time into question time by default', () => {
  renderApp();

  const continueButton = Array.from(div.querySelectorAll('button'))
    .find((button) => button.textContent === 'Continue');

  act(() => {
    Simulate.click(continueButton);
  });

  expect(div.querySelector('.stage-label').textContent).toBe('Question Time');
  expect(div.querySelector('.minute').textContent).toBe('05');
  expect(div.querySelector('.second').textContent).toBe('00');
  expect(div.querySelector('.bonus-time').textContent).toBe('+ 15:00');
});
