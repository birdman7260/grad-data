export const SQL = (strings: TemplateStringsArray, ...values: string[]) => {
  let ret = '';
  let i = 0;
  for (; i < values.length; i++) {
    ret += strings[i];
    ret += values[i];
  }
  ret += strings[i];
  return ret;
};
