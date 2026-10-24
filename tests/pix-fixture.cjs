// Synthetic EMV Pix fixture. It is never sent to a payment provider.
module.exports = function pixFixture(amount = '10.00') {
  const tlv = (tag, value) => tag + String(value.length).padStart(2, '0') + value;
  const payload = tlv('00', '01') + tlv('26', tlv('00', 'BR.GOV.BCB.PIX') + tlv('01', 'test@example.com')) + tlv('52', '0000') + tlv('53', '986') + tlv('54', amount) + tlv('58', 'BR') + tlv('59', 'TESTE') + tlv('60', 'GOIANIA') + tlv('62', tlv('05', '***')) + '6304';
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(payload)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0)) & 0xffff;
  }
  return payload + crc.toString(16).padStart(4, '0').toUpperCase();
};
