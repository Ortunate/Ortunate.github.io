import { makePart, type Part } from '../../src/lib/kinetic/model.ts';
/** Independent solver layouts. Never imported by a browser entrypoint. */
export const solutions:Record<string,Part[]>={
  descent:[{...makePart('rail','p-answer-1',4,5),angle:-.35,length:3.5}],
  switchback:[{...makePart('rail','p-answer-1',4,7),angle:-.35,length:4},{...makePart('rail','p-answer-2',6.6,4),angle:.35,length:4}],
  bounce:[makePart('bumper','p-answer-1',6,5)],
  launch:[{...makePart('pad','p-answer-1',5,2.5),angle:-.5,power:10}],
  balance:[{...makePart('seesaw','p-answer-1',7,4),length:3}],
  clockwork:[{...makePart('rotor','p-answer-1',7,5),angle:.5,power:-.7}],
};
