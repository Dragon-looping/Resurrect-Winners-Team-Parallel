import React from 'react';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { Colors } from '../../theme/tokens';

export const NetworkSchematicSvg: React.FC = () => {
  return (
    <Svg viewBox="0 0 420 120" width="100%" height={110}>
      {/* Orthogonal & Hairline Grid Links */}
      <Line
        x1={24}
        y1={60}
        x2={396}
        y2={60}
        stroke={Colors.secondary}
        strokeWidth={1}
        strokeDasharray="3 4"
      />
      <Path
        d="M56 60 C110 60, 124 26, 180 26 L240 26 C296 26, 310 60, 364 60"
        stroke={Colors.antiqueGold}
        strokeWidth={1.25}
        strokeOpacity={0.75}
        fill="none"
      />
      <Path
        d="M56 60 C110 60, 124 94, 180 94 L240 94 C296 94, 310 60, 364 60"
        stroke={Colors.secondaryContainer}
        strokeWidth={1}
        strokeOpacity={0.45}
        fill="none"
      />

      {/* Plant Nodes */}
      <Circle cx={56} cy={60} r={5} fill={Colors.inverseSurface} stroke={Colors.antiqueGold} strokeWidth={1.5} />
      <Circle cx={210} cy={26} r={4} fill={Colors.inverseSurface} stroke={Colors.antiqueGold} strokeWidth={1.5} />
      <Circle cx={210} cy={94} r={4} fill={Colors.inverseSurface} stroke={Colors.secondaryContainer} strokeWidth={1.25} />
      <Circle cx={364} cy={60} r={5} fill={Colors.primary} stroke={Colors.antiqueGold} strokeWidth={1.5} />

      {/* Technical Coordinate Ticks */}
      <SvgText x={36} y={84} fill={Colors.secondaryContainer} fillOpacity={0.75} fontSize={10} fontFamily="monospace">
        PLT-MGL
      </SvgText>
      <SvgText x={186} y={16} fill={Colors.antiqueGold} fillOpacity={0.9} fontSize={10} fontFamily="monospace">
        PLT-UDP
      </SvgText>
      <SvgText x={186} y={114} fill={Colors.secondaryContainer} fillOpacity={0.6} fontSize={10} fontFamily="monospace">
        PLT-MNP
      </SvgText>
      <SvgText x={340} y={84} fill={Colors.secondaryContainer} fillOpacity={0.75} fontSize={10} fontFamily="monospace">
        COMMIT
      </SvgText>
    </Svg>
  );
};
