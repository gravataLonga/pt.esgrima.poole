import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from './Button';

describe('Button', () => {
  it('dispara onPress quando ativo', async () => {
    const onPress = jest.fn();
    await render(<Button label="Submeter" onPress={onPress} />);

    await fireEvent.press(screen.getByText('Submeter'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('não dispara quando desativado e mostra o motivo', async () => {
    const onPress = jest.fn();
    await render(<Button label="Submeter" onPress={onPress} disabled hint="Texto de ajuda" />);

    await fireEvent.press(screen.getByText('Submeter'));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByText('Texto de ajuda')).toBeTruthy();
  });
});
